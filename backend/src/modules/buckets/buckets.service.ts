import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from '../../services/s3/s3.service';
import { GarageAdminService } from '../../services/s3/garage-admin.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { CreateBucketDto } from './dto/create-bucket.dto';
import { UpdateBucketDto } from './dto/update-bucket.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class BucketsService {
  private readonly logger = new Logger(BucketsService.name);

  constructor(
    private prisma: PrismaService,
    private s3: S3Service,
    private garageAdmin: GarageAdminService,
    private webhooks: WebhooksService,
  ) {}

  async findAll(appId: string, query: { page?: number; limit?: number }) {
    const { page = 1, limit = 20 } = query;

    const [buckets, total] = await Promise.all([
      this.prisma.bucket.findMany({
        where: { applicationId: appId },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { files: true },
          },
        },
      }),
      this.prisma.bucket.count({ where: { applicationId: appId } }),
    ]);

    return {
      data: buckets.map((bucket) => ({
        id: bucket.id,
        name: bucket.name,
        usedBytes: Number(bucket.usedBytes),
        quotaBytes: bucket.quotaBytes ? Number(bucket.quotaBytes) : null,
        fileCount: bucket._count.files,
        isPublic: bucket.isPublic,
        createdAt: bucket.createdAt,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(appId: string, bucketId: string) {
    const bucket = await this.prisma.bucket.findFirst({
      where: { id: bucketId, applicationId: appId },
      include: {
        _count: {
          select: { files: true },
        },
      },
    });

    if (!bucket) {
      throw new NotFoundException('Bucket not found');
    }

    return {
      id: bucket.id,
      name: bucket.name,
      usedBytes: Number(bucket.usedBytes),
      quotaBytes: bucket.quotaBytes ? Number(bucket.quotaBytes) : null,
      fileCount: bucket._count.files,
      isPublic: bucket.isPublic,
      corsEnabled: bucket.corsEnabled,
      versioningEnabled: bucket.versioningEnabled,
      createdAt: bucket.createdAt,
      updatedAt: bucket.updatedAt,
    };
  }

  async create(appId: string, dto: CreateBucketDto) {
    // Check if bucket name already exists for this app
    const existing = await this.prisma.bucket.findFirst({
      where: { applicationId: appId, name: dto.name },
    });

    if (existing) {
      throw new BadRequestException('Bucket name already exists');
    }

    // Generate unique bucket ID for Garage
    const garageBucketId = `${appId.substring(0, 8)}-${dto.name}-${uuidv4().substring(0, 8)}`;

    // Create bucket in Garage
    try {
      await this.s3.createBucket(garageBucketId);
    } catch (error) {
      throw new BadRequestException(
        `Failed to create bucket in storage: ${(error as Error).message}`,
      );
    }

    // Create bucket record in database
    const bucket = await this.prisma.bucket.create({
      data: {
        applicationId: appId,
        name: dto.name,
        garageBucketId,
        quotaBytes: dto.quotaBytes ? BigInt(dto.quotaBytes) : null,
        isPublic: dto.isPublic || false,
        corsEnabled: dto.corsEnabled !== false,
      },
    });

    // Trigger webhook
    await this.webhooks.trigger(appId, 'bucket.created', {
      bucketId: bucket.id,
      name: bucket.name,
      garageBucketId: bucket.garageBucketId,
    });

    return {
      id: bucket.id,
      name: bucket.name,
      garageBucketId: bucket.garageBucketId,
      createdAt: bucket.createdAt,
    };
  }

  async update(appId: string, bucketId: string, dto: UpdateBucketDto) {
    const bucket = await this.prisma.bucket.findFirst({
      where: { id: bucketId, applicationId: appId },
    });

    if (!bucket) {
      throw new NotFoundException('Bucket not found');
    }

    const updated = await this.prisma.bucket.update({
      where: { id: bucketId },
      data: {
        quotaBytes: dto.quotaBytes ? BigInt(dto.quotaBytes) : undefined,
        isPublic: dto.isPublic,
        corsEnabled: dto.corsEnabled,
      },
    });

    return {
      id: updated.id,
      updatedAt: updated.updatedAt,
    };
  }

  /**
   * Update bucket settings or reassign to a different application (Admin only)
   */
  async updateAdmin(bucketId: string, dto: UpdateBucketDto) {
    // Get current bucket with application
    const bucket = await this.prisma.bucket.findUnique({
      where: { id: bucketId },
      include: { application: true },
    });

    if (!bucket) {
      throw new NotFoundException('Bucket not found');
    }

    // Handle applicationId change (reassignment)
    if (dto.applicationId && dto.applicationId !== bucket.applicationId) {
      const oldAppId = bucket.applicationId;
      const newAppId = dto.applicationId;

      // Verify target app exists
      const targetApp = await this.prisma.application.findUnique({
        where: { id: newAppId },
      });
      if (!targetApp) {
        throw new NotFoundException('Target application not found');
      }

      // Check name conflict in target app
      const conflict = await this.prisma.bucket.findFirst({
        where: { applicationId: newAppId, name: bucket.name },
      });
      if (conflict) {
        throw new BadRequestException(
          `Bucket "${bucket.name}" already exists in target application`,
        );
      }

      // Check quota - block if target app would exceed
      const bucketSize = bucket.usedBytes || BigInt(0);
      if (targetApp.usedStorageBytes + bucketSize > targetApp.maxStorageBytes) {
        throw new BadRequestException(
          'Target application would exceed storage quota',
        );
      }

      // Update in transaction
      await this.prisma.$transaction([
        // Update bucket's applicationId
        this.prisma.bucket.update({
          where: { id: bucketId },
          data: { applicationId: newAppId },
        }),
        // Decrement old app's usedStorageBytes
        this.prisma.application.update({
          where: { id: oldAppId },
          data: { usedStorageBytes: { decrement: bucketSize } },
        }),
        // Increment new app's usedStorageBytes
        this.prisma.application.update({
          where: { id: newAppId },
          data: { usedStorageBytes: { increment: bucketSize } },
        }),
      ]);

      // Trigger webhooks to both apps
      await this.webhooks.trigger(oldAppId, 'bucket.reassigned', {
        bucketId: bucket.id,
        bucketName: bucket.name,
        fromApplicationId: oldAppId,
        toApplicationId: newAppId,
        action: 'removed',
      });
      await this.webhooks.trigger(newAppId, 'bucket.reassigned', {
        bucketId: bucket.id,
        bucketName: bucket.name,
        fromApplicationId: oldAppId,
        toApplicationId: newAppId,
        action: 'added',
      });

      this.logger.log(
        `Bucket "${bucket.name}" reassigned from app ${oldAppId} to ${newAppId}`,
      );
    }

    // Update other fields (quotaBytes, isPublic, corsEnabled)
    const updated = await this.prisma.bucket.update({
      where: { id: bucketId },
      data: {
        quotaBytes: dto.quotaBytes !== undefined ? BigInt(dto.quotaBytes) : undefined,
        isPublic: dto.isPublic,
        corsEnabled: dto.corsEnabled,
      },
      include: {
        application: {
          select: { id: true, name: true, slug: true },
        },
        _count: {
          select: { files: true },
        },
      },
    });

    return {
      id: updated.id,
      name: updated.name,
      applicationId: updated.applicationId,
      application: updated.application,
      usedBytes: Number(updated.usedBytes),
      quotaBytes: updated.quotaBytes ? Number(updated.quotaBytes) : null,
      fileCount: updated._count.files,
      isPublic: updated.isPublic,
      corsEnabled: updated.corsEnabled,
      updatedAt: updated.updatedAt,
    };
  }

  async delete(appId: string, bucketId: string, force: boolean = false) {
    const bucket = await this.prisma.bucket.findFirst({
      where: { id: bucketId, applicationId: appId },
      include: {
        _count: { select: { files: true } },
      },
    });

    if (!bucket) {
      throw new NotFoundException('Bucket not found');
    }

    if (bucket._count.files > 0 && !force) {
      throw new ForbiddenException(
        'Bucket is not empty. Use force=true to delete with contents.',
      );
    }

    // If force delete, delete all files first
    if (force && bucket._count.files > 0) {
      const files = await this.prisma.file.findMany({
        where: { bucketId },
        select: { key: true },
      });

      // Delete files from S3
      for (const file of files) {
        try {
          await this.s3.deleteFile(bucket.garageBucketId, file.key);
        } catch (error) {
          // Log but continue
          console.error(`Failed to delete file ${file.key}:`, error);
        }
      }

      // Delete file records
      await this.prisma.file.deleteMany({ where: { bucketId } });
    }

    // Delete bucket from Garage
    try {
      await this.s3.deleteBucket(bucket.garageBucketId);
    } catch (error) {
      // Log but continue
      console.error(`Failed to delete bucket from storage:`, error);
    }

    // Delete bucket record
    await this.prisma.bucket.delete({ where: { id: bucketId } });

    // Trigger webhook
    await this.webhooks.trigger(appId, 'bucket.deleted', {
      bucketId: bucket.id,
      name: bucket.name,
    });
  }
}
