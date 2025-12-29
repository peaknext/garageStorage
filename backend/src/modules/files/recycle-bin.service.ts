import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from '../../services/s3/s3.service';
import { WebhooksService } from '../webhooks/webhooks.service';

@Injectable()
export class RecycleBinService {
  private readonly logger = new Logger(RecycleBinService.name);

  constructor(
    private prisma: PrismaService,
    private s3: S3Service,
    private webhooks: WebhooksService,
    private eventEmitter: EventEmitter2,
  ) {}

  /**
   * List deleted files with pagination and filtering
   */
  async listDeletedFiles(query: {
    applicationId?: string;
    bucketId?: string;
    page?: number;
    limit?: number;
  }) {
    const { applicationId, bucketId, page = 1, limit = 50 } = query;

    const where: any = {
      deletedAt: { not: null },
    };

    if (bucketId) {
      where.bucketId = bucketId;
    } else if (applicationId) {
      where.bucket = { applicationId };
    }

    const [files, total] = await Promise.all([
      this.prisma.file.findMany({
        where,
        include: {
          bucket: {
            select: {
              id: true,
              name: true,
              applicationId: true,
              application: {
                select: { id: true, name: true },
              },
            },
          },
          tags: {
            include: { tag: true },
          },
        },
        orderBy: { deletedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.file.count({ where }),
    ]);

    const formattedFiles = files.map((file) => ({
      id: file.id,
      key: file.key,
      originalName: file.originalName,
      mimeType: file.mimeType,
      sizeBytes: Number(file.sizeBytes),
      deletedAt: file.deletedAt,
      deletedBy: file.deletedBy,
      daysRemaining: this.calculateDaysRemaining(file.deletedAt!, 30),
      bucket: {
        id: file.bucket.id,
        name: file.bucket.name,
      },
      application: file.bucket.application,
      tags: file.tags?.map((ft) => ({
        id: ft.tag.id,
        name: ft.tag.name,
        color: ft.tag.color,
      })),
      createdAt: file.createdAt,
    }));

    return {
      data: formattedFiles,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Soft delete a file - marks as deleted and frees quota
   */
  async softDelete(
    appId: string,
    bucketId: string,
    fileId: string,
    deletedBy: string,
  ) {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, bucketId, deletedAt: null },
      include: { bucket: true },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    if (file.bucket.applicationId !== appId) {
      throw new ForbiddenException('Access denied');
    }

    // Mark as deleted
    await this.prisma.file.update({
      where: { id: fileId },
      data: {
        deletedAt: new Date(),
        deletedBy,
      },
    });

    // Free quota immediately
    await this.updateUsageStats(appId, bucketId, -file.sizeBytes);

    // Trigger webhook
    await this.webhooks.trigger(appId, 'file.deleted', {
      fileId,
      key: file.key,
      bucket: file.bucket.name,
      deletedAt: new Date().toISOString(),
    });

    // Emit audit event
    this.eventEmitter.emit('audit.log', {
      actorType: deletedBy === 'system' ? 'SYSTEM' : 'ADMIN_USER',
      actorId: deletedBy,
      action: 'FILE_SOFT_DELETED',
      resourceType: 'FILE',
      resourceId: fileId,
      resourceName: file.originalName,
      metadata: { bucketId, key: file.key },
    });

    this.logger.log(`File ${fileId} soft-deleted by ${deletedBy}`);
  }

  /**
   * Restore a soft-deleted file
   */
  async restore(appId: string, fileId: string) {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, deletedAt: { not: null } },
      include: { bucket: true },
    });

    if (!file) {
      throw new NotFoundException('Deleted file not found');
    }

    if (file.bucket.applicationId !== appId) {
      throw new ForbiddenException('Access denied');
    }

    // Check quota before restoring
    const app = await this.prisma.application.findUnique({
      where: { id: appId },
    });

    if (!app) {
      throw new NotFoundException('Application not found');
    }

    const newUsedBytes = BigInt(app.usedStorageBytes) + file.sizeBytes;
    if (newUsedBytes > app.maxStorageBytes) {
      throw new ForbiddenException(
        'Cannot restore file: application storage quota would be exceeded',
      );
    }

    // Check bucket quota if set
    if (file.bucket.quotaBytes) {
      const newBucketUsed = BigInt(file.bucket.usedBytes) + file.sizeBytes;
      if (newBucketUsed > file.bucket.quotaBytes) {
        throw new ForbiddenException(
          'Cannot restore file: bucket storage quota would be exceeded',
        );
      }
    }

    // Restore file
    await this.prisma.file.update({
      where: { id: fileId },
      data: {
        deletedAt: null,
        deletedBy: null,
      },
    });

    // Add back to quota
    await this.updateUsageStats(appId, file.bucketId, file.sizeBytes);

    // Trigger webhook
    await this.webhooks.trigger(appId, 'file.restored', {
      fileId,
      key: file.key,
      bucket: file.bucket.name,
      restoredAt: new Date().toISOString(),
    });

    // Emit audit event
    this.eventEmitter.emit('audit.log', {
      actorType: 'ADMIN_USER',
      action: 'FILE_RESTORED',
      resourceType: 'FILE',
      resourceId: fileId,
      resourceName: file.originalName,
      metadata: { bucketId: file.bucketId, key: file.key },
    });

    this.logger.log(`File ${fileId} restored from recycle bin`);

    return { success: true, fileId };
  }

  /**
   * Permanently delete a file from recycle bin
   */
  async permanentDelete(appId: string, fileId: string, reason?: string) {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, deletedAt: { not: null } },
      include: { bucket: true },
    });

    if (!file) {
      throw new NotFoundException('Deleted file not found');
    }

    if (file.bucket.applicationId !== appId) {
      throw new ForbiddenException('Access denied');
    }

    // Delete from S3
    try {
      await this.s3.deleteFile(file.bucket.garageBucketId, file.key);
    } catch (error) {
      this.logger.warn(
        `Failed to delete file from S3: ${(error as Error).message}`,
      );
    }

    // Delete thumbnail from S3
    if (file.thumbnailKey) {
      try {
        await this.s3.deleteFile(file.bucket.garageBucketId, file.thumbnailKey);
      } catch (error) {
        this.logger.warn(
          `Failed to delete thumbnail from S3: ${(error as Error).message}`,
        );
      }
    }

    // Hard delete from database
    await this.prisma.file.delete({ where: { id: fileId } });

    // Trigger webhook
    await this.webhooks.trigger(appId, 'file.purged', {
      fileId,
      key: file.key,
      bucket: file.bucket.name,
      reason: reason || 'manual',
    });

    // Emit audit event
    this.eventEmitter.emit('audit.log', {
      actorType: reason === 'auto_purge_expired' ? 'SYSTEM' : 'ADMIN_USER',
      action: 'FILE_PERMANENTLY_DELETED',
      resourceType: 'FILE',
      resourceId: fileId,
      resourceName: file.originalName,
      metadata: { bucketId: file.bucketId, key: file.key, reason },
    });

    this.logger.log(`File ${fileId} permanently deleted (reason: ${reason || 'manual'})`);

    return { success: true, fileId };
  }

  /**
   * Purge all expired files (older than retentionDays)
   */
  async purgeExpiredFiles(
    retentionDays: number = 30,
    scope?: { applicationId?: string; bucketId?: string },
  ) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const where: any = {
      deletedAt: { lt: cutoffDate },
    };

    if (scope?.bucketId) {
      where.bucketId = scope.bucketId;
    } else if (scope?.applicationId) {
      where.bucket = { applicationId: scope.applicationId };
    }

    const files = await this.prisma.file.findMany({
      where,
      include: { bucket: true },
    });

    let purgedCount = 0;
    let freedBytes = BigInt(0);
    const failed: string[] = [];

    for (const file of files) {
      try {
        await this.permanentDelete(
          file.bucket.applicationId,
          file.id,
          'auto_purge_expired',
        );
        purgedCount++;
        freedBytes += file.sizeBytes;
      } catch (error) {
        this.logger.error(
          `Failed to purge file ${file.id}: ${(error as Error).message}`,
        );
        failed.push(file.id);
      }
    }

    this.logger.log(
      `Auto-purge complete: ${purgedCount} files purged, ${Number(freedBytes)} bytes freed`,
    );

    return {
      purgedCount,
      freedBytes: Number(freedBytes),
      filesFound: files.length,
      failed,
    };
  }

  /**
   * Empty recycle bin (permanent delete all)
   */
  async emptyRecycleBin(appId: string, bucketId?: string) {
    const where: any = {
      deletedAt: { not: null },
      bucket: { applicationId: appId },
    };

    if (bucketId) {
      where.bucketId = bucketId;
    }

    const files = await this.prisma.file.findMany({
      where,
      include: { bucket: true },
    });

    let deletedCount = 0;
    let freedBytes = BigInt(0);
    const failed: string[] = [];

    for (const file of files) {
      try {
        await this.permanentDelete(appId, file.id, 'empty_recycle_bin');
        deletedCount++;
        freedBytes += file.sizeBytes;
      } catch (error) {
        this.logger.error(
          `Failed to permanently delete file ${file.id}: ${(error as Error).message}`,
        );
        failed.push(file.id);
      }
    }

    return {
      deletedCount,
      freedBytes: Number(freedBytes),
      failed,
    };
  }

  /**
   * Get recycle bin statistics
   */
  async getStats(applicationId?: string, bucketId?: string) {
    const where: any = {
      deletedAt: { not: null },
    };

    if (bucketId) {
      where.bucketId = bucketId;
    } else if (applicationId) {
      where.bucket = { applicationId };
    }

    const [countResult, sizeResult, oldestFile] = await Promise.all([
      this.prisma.file.count({ where }),
      this.prisma.file.aggregate({
        where,
        _sum: { sizeBytes: true },
      }),
      this.prisma.file.findFirst({
        where,
        orderBy: { deletedAt: 'asc' },
        select: { deletedAt: true, originalName: true },
      }),
    ]);

    return {
      totalFiles: countResult,
      totalBytes: Number(sizeResult._sum.sizeBytes || 0),
      oldestFile: oldestFile
        ? {
            name: oldestFile.originalName,
            deletedAt: oldestFile.deletedAt,
            daysRemaining: this.calculateDaysRemaining(oldestFile.deletedAt!, 30),
          }
        : null,
    };
  }

  /**
   * Calculate days remaining before auto-purge
   */
  private calculateDaysRemaining(deletedAt: Date, retentionDays: number): number {
    const expiryDate = new Date(deletedAt);
    expiryDate.setDate(expiryDate.getDate() + retentionDays);
    const now = new Date();
    const diffMs = expiryDate.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  }

  /**
   * Update storage usage statistics
   */
  private async updateUsageStats(
    appId: string,
    bucketId: string,
    bytes: bigint,
  ) {
    await Promise.all([
      this.prisma.bucket.update({
        where: { id: bucketId },
        data: { usedBytes: { increment: bytes } },
      }),
      this.prisma.application.update({
        where: { id: appId },
        data: { usedStorageBytes: { increment: bytes } },
      }),
    ]);
  }
}
