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

  /**
   * Sync buckets from Garage to the database
   * Imports buckets that exist in Garage but not in the database
   */
  async syncFromGarage(applicationId: string): Promise<{
    synced: Array<{ id: string; name: string; garageBucketId: string }>;
    skipped: Array<{ garageBucketId: string; reason: string }>;
    total: number;
  }> {
    // Verify application exists
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    // Get all buckets from Garage
    const garageBuckets = await this.garageAdmin.listBuckets();
    this.logger.log(`Found ${garageBuckets.length} buckets in Garage`);

    // Get all existing bucket IDs from database
    const existingBuckets = await this.prisma.bucket.findMany({
      select: { garageBucketId: true },
    });
    const existingIds = new Set(existingBuckets.map((b) => b.garageBucketId));

    const synced: Array<{ id: string; name: string; garageBucketId: string }> = [];
    const skipped: Array<{ garageBucketId: string; reason: string }> = [];

    for (const garageBucket of garageBuckets) {
      const bucketName = this.garageAdmin.getBucketName(garageBucket);

      // Check if already exists by garage bucket ID
      if (existingIds.has(garageBucket.id)) {
        skipped.push({ garageBucketId: garageBucket.id, reason: 'Already exists in database (by ID)' });
        continue;
      }

      // Also check by alias name (in case it was created with a different ID format)
      if (existingIds.has(bucketName)) {
        skipped.push({ garageBucketId: bucketName, reason: 'Already exists in database (by name)' });
        continue;
      }

      // Check if a bucket with this name already exists for this application
      const existingByName = await this.prisma.bucket.findFirst({
        where: { applicationId, name: bucketName },
      });

      if (existingByName) {
        skipped.push({ garageBucketId: garageBucket.id, reason: `Bucket name "${bucketName}" already exists for this application` });
        continue;
      }

      // Create new bucket record
      try {
        const bucket = await this.prisma.bucket.create({
          data: {
            applicationId,
            name: bucketName,
            garageBucketId: garageBucket.id,
            isPublic: false,
            corsEnabled: true,
          },
        });

        synced.push({
          id: bucket.id,
          name: bucket.name,
          garageBucketId: bucket.garageBucketId,
        });

        this.logger.log(`Synced bucket: ${bucketName} (${garageBucket.id})`);
      } catch (error) {
        skipped.push({
          garageBucketId: garageBucket.id,
          reason: `Failed to create: ${(error as Error).message}`,
        });
      }
    }

    return {
      synced,
      skipped,
      total: garageBuckets.length,
    };
  }
}
