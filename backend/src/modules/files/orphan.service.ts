import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from '../../services/s3/s3.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ActorType } from '../../generated/prisma';

export interface DbOrphan {
  id: string;
  key: string;
  bucketId: string;
  bucketName: string;
  garageBucketId: string;
  sizeBytes: number;
  createdAt: Date;
  originalName: string;
  mimeType: string;
}

export interface S3Orphan {
  key: string;
  bucketId: string;
  bucketName: string;
  garageBucketId: string;
  sizeBytes: number;
  lastModified: Date;
}

export interface OrphanScanResult {
  dbOrphans: DbOrphan[];
  s3Orphans: S3Orphan[];
  stats: {
    dbOrphanCount: number;
    dbOrphanBytes: number;
    s3OrphanCount: number;
    s3OrphanBytes: number;
    bucketsScanned: number;
  };
}

export interface CleanupResult {
  deletedDbRecords: number;
  deletedS3Files: number;
  freedBytes: number;
  errors: string[];
}

@Injectable()
export class OrphanService {
  private readonly logger = new Logger(OrphanService.name);

  constructor(
    private prisma: PrismaService,
    private s3: S3Service,
    private eventEmitter: EventEmitter2,
  ) {}

  /**
   * Scan all buckets for orphan files
   * - DB orphans: Files in database but not in S3
   * - S3 orphans: Files in S3 but not in database
   */
  async scanForOrphans(bucketId?: string): Promise<OrphanScanResult> {
    this.logger.log(`Starting orphan scan${bucketId ? ` for bucket ${bucketId}` : ' for all buckets'}`);

    const buckets = bucketId
      ? await this.prisma.bucket.findMany({ where: { id: bucketId } })
      : await this.prisma.bucket.findMany();

    const dbOrphans: DbOrphan[] = [];
    const s3Orphans: S3Orphan[] = [];
    let totalDbOrphanBytes = 0;
    let totalS3OrphanBytes = 0;

    for (const bucket of buckets) {
      try {
        // Get all DB file keys for this bucket (exclude soft-deleted files)
        const dbFiles = await this.prisma.file.findMany({
          where: { bucketId: bucket.id, deletedAt: null },
          select: {
            id: true,
            key: true,
            sizeBytes: true,
            createdAt: true,
            originalName: true,
            mimeType: true,
          },
        });
        const dbKeyMap = new Map(dbFiles.map((f) => [f.key, f]));
        const dbKeys = new Set(dbFiles.map((f) => f.key));

        // Get soft-deleted file keys (files in recycle bin - still in S3 but not active)
        const softDeletedFiles = await this.prisma.file.findMany({
          where: { bucketId: bucket.id, deletedAt: { not: null } },
          select: { key: true },
        });
        const softDeletedKeys = new Set(softDeletedFiles.map((f) => f.key));

        // Get all S3 file keys for this bucket
        const s3Keys = new Set<string>();
        const s3FileMap = new Map<string, { size: number; lastModified: Date }>();
        let continuationToken: string | undefined;

        do {
          const result = await this.s3.listFiles(
            bucket.garageBucketId,
            undefined,
            1000,
            continuationToken,
          );

          for (const s3File of result.files) {
            s3Keys.add(s3File.key);
            s3FileMap.set(s3File.key, {
              size: s3File.size,
              lastModified: s3File.lastModified,
            });
          }

          continuationToken = result.nextToken;
        } while (continuationToken);

        // Find DB orphans (in DB but not in S3)
        for (const [key, file] of dbKeyMap) {
          if (!s3Keys.has(key)) {
            const sizeBytes = Number(file.sizeBytes);
            dbOrphans.push({
              id: file.id,
              key,
              bucketId: bucket.id,
              bucketName: bucket.name,
              garageBucketId: bucket.garageBucketId,
              sizeBytes,
              createdAt: file.createdAt,
              originalName: file.originalName,
              mimeType: file.mimeType,
            });
            totalDbOrphanBytes += sizeBytes;
          }
        }

        // Get all thumbnail keys from DB for this bucket to exclude them from orphan detection
        const filesWithThumbnails = await this.prisma.file.findMany({
          where: { bucketId: bucket.id, thumbnailKey: { not: null } },
          select: { thumbnailKey: true },
        });
        const thumbnailKeys = new Set(
          filesWithThumbnails.map((f) => f.thumbnailKey).filter(Boolean),
        );

        // Find S3 orphans (in S3 but not in DB)
        // Exclude: system prefixes (_thumbnails/), valid thumbnail keys, and soft-deleted files
        for (const [key, s3File] of s3FileMap) {
          // Skip if it's a known active file key
          if (dbKeys.has(key)) continue;

          // Skip if it's a soft-deleted file (in recycle bin)
          if (softDeletedKeys.has(key)) continue;

          // Skip if it's a valid thumbnail for an existing file
          if (thumbnailKeys.has(key)) continue;

          // Skip system directories/prefixes that shouldn't be treated as orphans
          if (key.startsWith('_thumbnails/') || key.startsWith('_system/')) {
            // Double-check: if it's in _thumbnails/ but not a valid thumbnail, it's orphaned
            if (key.startsWith('_thumbnails/') && !thumbnailKeys.has(key)) {
              // This is an orphaned thumbnail (parent file was deleted)
              s3Orphans.push({
                key,
                bucketId: bucket.id,
                bucketName: bucket.name,
                garageBucketId: bucket.garageBucketId,
                sizeBytes: s3File.size,
                lastModified: s3File.lastModified,
              });
              totalS3OrphanBytes += s3File.size;
            }
            continue;
          }

          s3Orphans.push({
            key,
            bucketId: bucket.id,
            bucketName: bucket.name,
            garageBucketId: bucket.garageBucketId,
            sizeBytes: s3File.size,
            lastModified: s3File.lastModified,
          });
          totalS3OrphanBytes += s3File.size;
        }

        this.logger.log(
          `Bucket ${bucket.name}: ${dbOrphans.length} DB orphans, ${s3Orphans.length} S3 orphans`,
        );
      } catch (error) {
        this.logger.error(
          `Error scanning bucket ${bucket.name}: ${(error as Error).message}`,
        );
      }
    }

    const result: OrphanScanResult = {
      dbOrphans,
      s3Orphans,
      stats: {
        dbOrphanCount: dbOrphans.length,
        dbOrphanBytes: totalDbOrphanBytes,
        s3OrphanCount: s3Orphans.length,
        s3OrphanBytes: totalS3OrphanBytes,
        bucketsScanned: buckets.length,
      },
    };

    this.logger.log(
      `Orphan scan complete: ${result.stats.dbOrphanCount} DB orphans (${this.formatBytes(result.stats.dbOrphanBytes)}), ` +
        `${result.stats.s3OrphanCount} S3 orphans (${this.formatBytes(result.stats.s3OrphanBytes)})`,
    );

    return result;
  }

  /**
   * Cleanup orphan database records (files in DB but not in S3)
   */
  async cleanupDbOrphans(
    fileIds?: string[],
    bucketId?: string,
  ): Promise<CleanupResult> {
    this.logger.log('Starting DB orphan cleanup');

    const result: CleanupResult = {
      deletedDbRecords: 0,
      deletedS3Files: 0,
      freedBytes: 0,
      errors: [],
    };

    // If specific file IDs provided, clean those
    if (fileIds && fileIds.length > 0) {
      for (const fileId of fileIds) {
        try {
          const file = await this.prisma.file.findUnique({
            where: { id: fileId },
            include: { bucket: true },
          });

          if (!file) {
            result.errors.push(`File ${fileId} not found`);
            continue;
          }

          // Verify it's actually an orphan (not in S3)
          const existsInS3 = await this.s3.fileExists(
            file.bucket.garageBucketId,
            file.key,
          );

          if (existsInS3) {
            result.errors.push(`File ${fileId} exists in S3, not an orphan`);
            continue;
          }

          // Delete the DB record
          await this.prisma.file.delete({ where: { id: fileId } });

          // Update bucket usage
          await this.prisma.bucket.update({
            where: { id: file.bucketId },
            data: { usedBytes: { decrement: file.sizeBytes } },
          });

          // Update application usage
          await this.prisma.application.update({
            where: { id: file.bucket.applicationId },
            data: { usedStorageBytes: { decrement: file.sizeBytes } },
          });

          result.deletedDbRecords++;
          result.freedBytes += Number(file.sizeBytes);
        } catch (error) {
          result.errors.push(`Error deleting file ${fileId}: ${(error as Error).message}`);
        }
      }
    } else {
      // Clean all DB orphans (optionally filtered by bucket)
      const scanResult = await this.scanForOrphans(bucketId);

      for (const orphan of scanResult.dbOrphans) {
        try {
          const file = await this.prisma.file.findUnique({
            where: { id: orphan.id },
            include: { bucket: true },
          });

          if (!file) continue;

          // Delete the DB record
          await this.prisma.file.delete({ where: { id: orphan.id } });

          // Update bucket usage
          await this.prisma.bucket.update({
            where: { id: file.bucketId },
            data: { usedBytes: { decrement: file.sizeBytes } },
          });

          // Update application usage
          await this.prisma.application.update({
            where: { id: file.bucket.applicationId },
            data: { usedStorageBytes: { decrement: file.sizeBytes } },
          });

          result.deletedDbRecords++;
          result.freedBytes += orphan.sizeBytes;
        } catch (error) {
          result.errors.push(`Error deleting orphan ${orphan.id}: ${(error as Error).message}`);
        }
      }
    }

    this.logger.log(
      `DB orphan cleanup complete: ${result.deletedDbRecords} records deleted, ` +
        `${this.formatBytes(result.freedBytes)} freed`,
    );

    this.eventEmitter.emit('audit.log', {
      actorType: ActorType.SYSTEM,
      action: 'ORPHAN_CLEANUP',
      resourceType: 'FILE',
      metadata: {
        deletedDbRecords: result.deletedDbRecords,
        freedBytes: result.freedBytes,
        errors: result.errors.length,
      },
    });

    return result;
  }

  /**
   * Cleanup orphan S3 files (files in S3 but not in DB)
   */
  async cleanupS3Orphans(
    orphans?: Array<{ key: string; garageBucketId: string }>,
    bucketId?: string,
  ): Promise<CleanupResult> {
    this.logger.log('Starting S3 orphan cleanup');

    const result: CleanupResult = {
      deletedDbRecords: 0,
      deletedS3Files: 0,
      freedBytes: 0,
      errors: [],
    };

    let orphansToClean: Array<{ key: string; garageBucketId: string; sizeBytes: number }>;

    if (orphans && orphans.length > 0) {
      // Clean specific orphans
      orphansToClean = [];
      for (const orphan of orphans) {
        try {
          const metadata = await this.s3.getFileMetadata(
            orphan.garageBucketId,
            orphan.key,
          );
          orphansToClean.push({
            ...orphan,
            sizeBytes: metadata.contentLength,
          });
        } catch (error) {
          // File might not exist anymore
          result.errors.push(`File ${orphan.key} not found in S3`);
        }
      }
    } else {
      // Clean all S3 orphans
      const scanResult = await this.scanForOrphans(bucketId);
      orphansToClean = scanResult.s3Orphans.map((o) => ({
        key: o.key,
        garageBucketId: o.garageBucketId,
        sizeBytes: o.sizeBytes,
      }));
    }

    for (const orphan of orphansToClean) {
      try {
        await this.s3.deleteFile(orphan.garageBucketId, orphan.key);
        result.deletedS3Files++;
        result.freedBytes += orphan.sizeBytes;
      } catch (error) {
        result.errors.push(`Error deleting S3 file ${orphan.key}: ${(error as Error).message}`);
      }
    }

    this.logger.log(
      `S3 orphan cleanup complete: ${result.deletedS3Files} files deleted, ` +
        `${this.formatBytes(result.freedBytes)} freed`,
    );

    this.eventEmitter.emit('audit.log', {
      actorType: ActorType.SYSTEM,
      action: 'S3_ORPHAN_CLEANUP',
      resourceType: 'FILE',
      metadata: {
        deletedS3Files: result.deletedS3Files,
        freedBytes: result.freedBytes,
        errors: result.errors.length,
      },
    });

    return result;
  }

  /**
   * Cleanup all orphans (both DB and S3)
   */
  async cleanupAllOrphans(bucketId?: string): Promise<CleanupResult> {
    this.logger.log('Starting full orphan cleanup');

    const dbResult = await this.cleanupDbOrphans(undefined, bucketId);
    const s3Result = await this.cleanupS3Orphans(undefined, bucketId);

    return {
      deletedDbRecords: dbResult.deletedDbRecords,
      deletedS3Files: s3Result.deletedS3Files,
      freedBytes: dbResult.freedBytes + s3Result.freedBytes,
      errors: [...dbResult.errors, ...s3Result.errors],
    };
  }

  /**
   * Get quick orphan statistics without full scan details
   */
  async getOrphanStats(bucketId?: string): Promise<OrphanScanResult['stats']> {
    const result = await this.scanForOrphans(bucketId);
    return result.stats;
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
