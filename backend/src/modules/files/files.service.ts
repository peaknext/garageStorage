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
import { CacheService } from '../../services/cache/cache.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { PresignedUploadDto } from './dto/presigned-upload.dto';
import { ConfirmUploadDto } from './dto/confirm-upload.dto';
import { CopyFileDto } from './dto/copy-file.dto';
import { MoveFileDto } from './dto/move-file.dto';
import { SearchFilesDto } from './dto/search-files.dto';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import * as archiver from 'archiver';
import { Response } from 'express';
import { Inject, forwardRef } from '@nestjs/common';
import { ProcessingService } from '../processing/processing.service';

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private prisma: PrismaService,
    private s3: S3Service,
    private cache: CacheService,
    private webhooks: WebhooksService,
    @Inject(forwardRef(() => ProcessingService))
    private processing: ProcessingService,
    private eventEmitter: EventEmitter2,
  ) {}

  /**
   * Fix multer filename encoding issue.
   * Multer parses filenames as Latin-1, causing UTF-8 filenames (Thai, Chinese, etc.)
   * to be double-encoded. This function decodes the bytes correctly as UTF-8.
   */
  private fixFilenameEncoding(filename: string): string {
    try {
      // Convert the incorrectly decoded string back to bytes and decode as UTF-8
      const bytes = Buffer.from(filename, 'latin1');
      const decoded = bytes.toString('utf8');

      // Verify the decoded string is valid UTF-8 (not garbled)
      // If the original was already ASCII, return as-is
      if (decoded === filename || !/[\x80-\xff]/.test(filename)) {
        return filename;
      }

      return decoded;
    } catch {
      // If decoding fails, return original
      return filename;
    }
  }

  async getPresignedUploadUrl(
    appId: string,
    bucketId: string,
    dto: PresignedUploadDto,
  ) {
    const bucket = await this.getBucketWithQuotaCheck(
      appId,
      bucketId,
      dto.contentLength,
    );

    const key = dto.key || this.generateFileKey(dto.contentType);
    const uploadId = uuidv4();

    await this.cache.set(
      `upload:${uploadId}`,
      JSON.stringify({
        bucketId,
        key,
        contentType: dto.contentType,
        contentLength: dto.contentLength,
        metadata: dto.metadata,
        isPublic: dto.isPublic,
        createdAt: new Date().toISOString(),
      }),
      3600,
    );

    const uploadUrl = await this.s3.getPresignedUploadUrl(
      bucket.garageBucketId,
      key,
      dto.contentType,
      3600,
      dto.metadata,
    );

    return {
      uploadUrl,
      uploadId,
      key,
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      headers: {
        'Content-Type': dto.contentType,
      },
    };
  }

  async confirmUpload(appId: string, bucketId: string, dto: ConfirmUploadDto) {
    const uploadData = await this.cache.get(`upload:${dto.uploadId}`);
    if (!uploadData) {
      throw new BadRequestException('Upload session expired or invalid');
    }

    const upload = JSON.parse(uploadData);
    if (upload.bucketId !== bucketId) {
      throw new ForbiddenException('Bucket mismatch');
    }

    const bucket = await this.prisma.bucket.findUnique({
      where: { id: bucketId },
    });

    if (!bucket) {
      throw new NotFoundException('Bucket not found');
    }

    const exists = await this.s3.fileExists(bucket.garageBucketId, upload.key);
    if (!exists) {
      throw new BadRequestException('File not found in storage');
    }

    const s3Metadata = await this.s3.getFileMetadata(
      bucket.garageBucketId,
      upload.key,
    );

    const file = await this.prisma.file.create({
      data: {
        bucketId,
        key: upload.key,
        originalName:
          upload.metadata?.originalName || upload.key.split('/').pop() || 'file',
        mimeType: upload.contentType,
        sizeBytes: BigInt(s3Metadata.contentLength),
        etag: s3Metadata.etag,
        metadata: upload.metadata,
        isPublic: upload.isPublic || false,
      },
    });

    await this.prisma.bucket.update({
      where: { id: bucketId },
      data: {
        usedBytes: { increment: BigInt(s3Metadata.contentLength) },
      },
    });

    await this.prisma.application.update({
      where: { id: appId },
      data: {
        usedStorageBytes: { increment: BigInt(s3Metadata.contentLength) },
      },
    });

    await this.cache.del(`upload:${dto.uploadId}`);

    await this.webhooks.trigger(appId, 'file.uploaded', {
      fileId: file.id,
      key: file.key,
      bucket: bucket.name,
      size: s3Metadata.contentLength,
    });

    // Queue thumbnail generation for images
    if (upload.contentType.startsWith('image/')) {
      try {
        await this.processing.generateThumbnail(file.id);
      } catch (error) {
        this.logger.warn(`Failed to queue thumbnail for ${file.id}: ${(error as Error).message}`);
      }
    }

    return this.formatFileResponse(file, bucket.garageBucketId);
  }

  async uploadFile(
    appId: string,
    bucketId: string,
    file: Express.Multer.File,
    dto: { key?: string; metadata?: Record<string, string>; isPublic?: boolean },
  ) {
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new BadRequestException(
        'File too large for direct upload. Use presigned URL instead.',
      );
    }

    // Fix multer's Latin-1 filename encoding for non-ASCII characters (Thai, Chinese, etc.)
    const originalName = this.fixFilenameEncoding(file.originalname);

    const bucket = await this.getBucketWithQuotaCheck(appId, bucketId, file.size);
    const key = dto.key || this.generateFileKey(file.mimetype, originalName);

    const { etag } = await this.s3.uploadFile(
      bucket.garageBucketId,
      key,
      file.buffer,
      file.mimetype,
      dto.metadata,
    );

    const fileRecord = await this.prisma.file.create({
      data: {
        bucketId,
        key,
        originalName,
        mimeType: file.mimetype,
        sizeBytes: BigInt(file.size),
        checksum: this.calculateMd5(file.buffer),
        etag,
        metadata: dto.metadata,
        isPublic: dto.isPublic || false,
      },
    });

    await this.updateUsageStats(appId, bucketId, BigInt(file.size));

    await this.webhooks.trigger(appId, 'file.uploaded', {
      fileId: fileRecord.id,
      key,
      bucket: bucket.name,
      size: file.size,
    });

    // Queue thumbnail generation for images
    if (file.mimetype.startsWith('image/')) {
      try {
        await this.processing.generateThumbnail(fileRecord.id);
      } catch (error) {
        this.logger.warn(`Failed to queue thumbnail for ${fileRecord.id}: ${(error as Error).message}`);
      }
    }

    return this.formatFileResponse(fileRecord, bucket.garageBucketId);
  }

  async getDownloadUrl(
    appId: string,
    bucketId: string,
    fileId: string,
    expiresIn: number = 3600,
  ) {
    const file = await this.getFileWithBucket(bucketId, fileId);

    const url = await this.s3.getPresignedDownloadUrl(
      file.bucket.garageBucketId,
      file.key,
      expiresIn,
      file.originalName,
    );

    await this.prisma.file.update({
      where: { id: fileId },
      data: {
        downloadCount: { increment: 1 },
        lastAccessedAt: new Date(),
      },
    });

    await this.logAccess(appId, 'DOWNLOAD', 'FILE', fileId);

    // Trigger webhook
    await this.webhooks.trigger(appId, 'file.downloaded', {
      fileId,
      key: file.key,
      bucket: file.bucket.name,
      downloadCount: file.downloadCount + 1,
    });

    return {
      url,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    };
  }

  async deleteFile(
    appId: string,
    bucketId: string,
    fileId: string,
    options: { permanent?: boolean; deletedBy?: string } = {},
  ) {
    const { permanent = false, deletedBy = 'admin' } = options;
    const file = await this.getFileWithBucket(bucketId, fileId);

    if (permanent) {
      // Permanent delete: remove from S3 and hard delete from DB
      await this.s3.deleteFile(file.bucket.garageBucketId, file.key);

      // Delete thumbnail from S3 if it exists
      if (file.thumbnailKey) {
        try {
          await this.s3.deleteFile(file.bucket.garageBucketId, file.thumbnailKey);
        } catch (error) {
          this.logger.warn(`Failed to delete thumbnail for file ${fileId}: ${(error as Error).message}`);
        }
      }

      await this.prisma.file.delete({ where: { id: fileId } });

      // Only decrement quota if file wasn't already soft-deleted
      if (!file.deletedAt) {
        await this.updateUsageStats(appId, bucketId, -file.sizeBytes);
      }

      await this.webhooks.trigger(appId, 'file.purged', {
        fileId,
        key: file.key,
        bucket: file.bucket.name,
        reason: 'manual',
      });

      this.eventEmitter.emit('audit.log', {
        actorType: 'ADMIN_USER',
        action: 'FILE_PERMANENTLY_DELETED',
        resourceType: 'FILE',
        resourceId: fileId,
        resourceName: file.originalName,
        metadata: { bucketId, key: file.key },
      });
    } else {
      // Soft delete: mark as deleted and free quota
      await this.prisma.file.update({
        where: { id: fileId },
        data: {
          deletedAt: new Date(),
          deletedBy,
        },
      });

      await this.updateUsageStats(appId, bucketId, -file.sizeBytes);

      await this.webhooks.trigger(appId, 'file.deleted', {
        fileId,
        key: file.key,
        bucket: file.bucket.name,
        deletedAt: new Date().toISOString(),
      });

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
  }

  async bulkDelete(
    appId: string,
    bucketId: string,
    fileIds: string[],
    options: { permanent?: boolean; deletedBy?: string } = {},
  ) {
    const bucket = await this.prisma.bucket.findFirst({
      where: { id: bucketId, applicationId: appId },
    });

    if (!bucket) {
      throw new NotFoundException('Bucket not found');
    }

    const deleted: string[] = [];
    const failed: string[] = [];

    for (const fileId of fileIds) {
      try {
        await this.deleteFile(appId, bucketId, fileId, options);
        deleted.push(fileId);
      } catch {
        failed.push(fileId);
      }
    }

    return { deleted: deleted.length, failed };
  }

  async listFiles(
    appId: string,
    bucketId: string,
    query: {
      page?: number;
      limit?: number;
      prefix?: string;
      mimeType?: string;
      sort?: string;
      order?: 'asc' | 'desc';
      dateFrom?: Date;
      dateTo?: Date;
      sizeMin?: number;
      sizeMax?: number;
    },
  ) {
    const {
      page = 1,
      limit = 50,
      prefix,
      mimeType,
      sort = 'createdAt',
      order = 'desc',
      dateFrom,
      dateTo,
      sizeMin,
      sizeMax,
    } = query;

    const bucket = await this.prisma.bucket.findFirst({
      where: { id: bucketId, applicationId: appId },
    });

    if (!bucket) {
      throw new NotFoundException('Bucket not found');
    }

    const where: any = { bucketId, deletedAt: null };
    if (prefix) {
      where.OR = [
        { key: { contains: prefix, mode: 'insensitive' } },
        { originalName: { contains: prefix, mode: 'insensitive' } },
      ];
    }
    if (mimeType) {
      where.mimeType = { startsWith: mimeType };
    }
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = dateFrom;
      if (dateTo) where.createdAt.lte = dateTo;
    }
    if (sizeMin !== undefined || sizeMax !== undefined) {
      where.sizeBytes = {};
      if (sizeMin !== undefined) where.sizeBytes.gte = BigInt(sizeMin);
      if (sizeMax !== undefined) where.sizeBytes.lte = BigInt(sizeMax);
    }

    const [files, total] = await Promise.all([
      this.prisma.file.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sort]: order },
        include: {
          tags: {
            include: {
              tag: true,
            },
          },
        },
      }),
      this.prisma.file.count({ where }),
    ]);

    return {
      data: await Promise.all(
        files.map((f) => this.formatFileResponse(f, bucket.garageBucketId)),
      ),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getFileDetails(appId: string, bucketId: string, fileId: string) {
    const file = await this.getFileWithBucket(bucketId, fileId);

    return {
      id: file.id,
      key: file.key,
      originalName: file.originalName,
      mimeType: file.mimeType,
      sizeBytes: Number(file.sizeBytes),
      checksum: file.checksum,
      metadata: file.metadata,
      isPublic: file.isPublic,
      uploadedBy: file.uploadedBy,
      downloadCount: file.downloadCount,
      lastAccessedAt: file.lastAccessedAt,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
    };
  }

  async updateFile(
    appId: string,
    bucketId: string,
    fileId: string,
    dto: { originalName?: string; metadata?: Record<string, any>; isPublic?: boolean },
  ) {
    const file = await this.getFileWithBucket(bucketId, fileId);

    const data: any = {};
    if (dto.originalName !== undefined) data.originalName = dto.originalName;
    if (dto.metadata !== undefined) data.metadata = dto.metadata;
    if (dto.isPublic !== undefined) data.isPublic = dto.isPublic;

    const updated = await this.prisma.file.update({
      where: { id: fileId },
      data,
    });

    if (dto.originalName) {
      this.eventEmitter.emit('audit.log', {
        actorType: 'ADMIN_USER',
        action: 'FILE_RENAMED',
        resourceType: 'FILE',
        resourceId: fileId,
        resourceName: dto.originalName,
        previousValue: { originalName: file.originalName },
        newValue: { originalName: dto.originalName },
      });
    }

    return {
      id: updated.id,
      originalName: updated.originalName,
      updatedAt: updated.updatedAt,
    };
  }

  async streamZipDownload(
    appId: string,
    bucketId: string,
    fileIds: string[],
    res: Response,
  ) {
    if (!fileIds.length) {
      throw new BadRequestException('No files specified');
    }

    if (fileIds.length > 100) {
      throw new BadRequestException('Maximum 100 files per ZIP download');
    }

    const bucket = await this.prisma.bucket.findFirst({
      where: { id: bucketId, applicationId: appId },
    });

    if (!bucket) {
      throw new NotFoundException('Bucket not found');
    }

    const files = await this.prisma.file.findMany({
      where: { id: { in: fileIds }, bucketId, deletedAt: null },
    });

    if (!files.length) {
      throw new NotFoundException('No files found');
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const zipFilename = `${bucket.name}-${timestamp}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);

    const archive = archiver('zip', { zlib: { level: 5 } });
    archive.pipe(res);

    for (const file of files) {
      try {
        const buffer = await this.s3.downloadFile(bucket.garageBucketId, file.key);
        archive.append(buffer, { name: file.originalName || file.key });
      } catch (error) {
        this.logger.error(`Failed to add file ${file.id} to ZIP: ${(error as Error).message}`);
      }
    }

    await archive.finalize();
  }

  // Private helper methods

  private async getBucketWithQuotaCheck(
    appId: string,
    bucketId: string,
    fileSize: number,
  ) {
    const bucket = await this.prisma.bucket.findFirst({
      where: {
        id: bucketId,
        applicationId: appId,
      },
      include: { application: true },
    });

    if (!bucket) {
      throw new NotFoundException('Bucket not found');
    }

    const newUsage = Number(bucket.application.usedStorageBytes) + fileSize;
    if (newUsage > Number(bucket.application.maxStorageBytes)) {
      throw new ForbiddenException('Application storage quota exceeded');
    }

    if (bucket.quotaBytes) {
      const newBucketUsage = Number(bucket.usedBytes) + fileSize;
      if (newBucketUsage > Number(bucket.quotaBytes)) {
        throw new ForbiddenException('Bucket storage quota exceeded');
      }
    }

    return bucket;
  }

  private async getFileWithBucket(bucketId: string, fileId: string) {
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, bucketId },
      include: { bucket: true },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    return file;
  }

  private generateFileKey(mimeType: string, originalName?: string): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const uuid = uuidv4();
    const ext = this.getExtension(mimeType, originalName);

    return `${year}/${month}/${day}/${uuid}${ext}`;
  }

  private getExtension(mimeType: string, filename?: string): string {
    if (filename) {
      const parts = filename.split('.');
      if (parts.length > 1) {
        return `.${parts.pop()}`;
      }
    }

    const mimeToExt: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'application/pdf': '.pdf',
      'text/plain': '.txt',
      'application/json': '.json',
    };

    return mimeToExt[mimeType] || '';
  }

  private calculateMd5(buffer: Buffer): string {
    return crypto.createHash('md5').update(buffer).digest('hex');
  }

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

  private async logAccess(
    appId: string,
    action: string,
    resourceType: string,
    resourceId: string,
  ) {
    await this.prisma.accessLog.create({
      data: {
        applicationId: appId,
        action,
        resourceType,
        resourceId,
      },
    });
  }

  private async formatFileResponse(file: any, garageBucketId: string) {
    const url = await this.s3.getPresignedDownloadUrl(
      garageBucketId,
      file.key,
      300,
    );

    // Get thumbnail URL if available
    let thumbnailUrl: string | null = null;
    if (file.thumbnailStatus === 'GENERATED' && file.thumbnailKey) {
      thumbnailUrl = await this.s3.getPresignedDownloadUrl(
        garageBucketId,
        file.thumbnailKey,
        300,
      );
    }

    // Format tags if present
    const tags = file.tags?.map((ft: any) => ({
      id: ft.tag.id,
      name: ft.tag.name,
      color: ft.tag.color,
    })) || [];

    return {
      id: file.id,
      key: file.key,
      originalName: file.originalName,
      mimeType: file.mimeType,
      sizeBytes: Number(file.sizeBytes),
      isPublic: file.isPublic,
      downloadCount: file.downloadCount,
      thumbnailStatus: file.thumbnailStatus,
      thumbnailUrl,
      tags,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
      url,
    };
  }

  async listVersions(appId: string, bucketId: string, fileId: string) {
    const file = await this.getFileWithBucket(bucketId, fileId);

    const versions = await this.prisma.fileVersion.findMany({
      where: { fileId },
      orderBy: { versionNumber: 'desc' },
    });

    return {
      fileId,
      currentKey: file.key,
      versions: versions.map((v) => ({
        id: v.id,
        versionNumber: v.versionNumber,
        sizeBytes: Number(v.sizeBytes),
        checksum: v.checksum,
        uploadedBy: v.uploadedBy,
        createdAt: v.createdAt,
      })),
    };
  }

  async restoreVersion(
    appId: string,
    bucketId: string,
    fileId: string,
    versionId: string,
  ) {
    const file = await this.getFileWithBucket(bucketId, fileId);

    if (!file.bucket.versioningEnabled) {
      throw new BadRequestException('Versioning is not enabled for this bucket');
    }

    const version = await this.prisma.fileVersion.findFirst({
      where: { id: versionId, fileId },
    });

    if (!version) {
      throw new NotFoundException('Version not found');
    }

    // Copy the version's S3 object to the current file key
    await this.s3.copyFile(
      file.bucket.garageBucketId,
      version.key,
      file.bucket.garageBucketId,
      file.key,
    );

    // Save current as new version before restoring
    const latestVersion = await this.prisma.fileVersion.findFirst({
      where: { fileId },
      orderBy: { versionNumber: 'desc' },
    });
    const nextVersionNumber = (latestVersion?.versionNumber || 0) + 1;

    await this.prisma.fileVersion.create({
      data: {
        fileId,
        versionNumber: nextVersionNumber,
        key: file.key,
        sizeBytes: file.sizeBytes,
        checksum: file.checksum,
        etag: file.etag,
      },
    });

    // Update file record with version's data
    await this.prisma.file.update({
      where: { id: fileId },
      data: {
        sizeBytes: version.sizeBytes,
        checksum: version.checksum,
        etag: version.etag,
      },
    });

    this.eventEmitter.emit('audit.log', {
      actorType: 'ADMIN_USER',
      action: 'FILE_VERSION_RESTORED',
      resourceType: 'FILE',
      resourceId: fileId,
      metadata: { versionId, versionNumber: version.versionNumber },
    });

    return { restored: true, versionNumber: version.versionNumber };
  }

  async deleteVersion(
    appId: string,
    bucketId: string,
    fileId: string,
    versionId: string,
  ) {
    const file = await this.getFileWithBucket(bucketId, fileId);

    const version = await this.prisma.fileVersion.findFirst({
      where: { id: versionId, fileId },
    });

    if (!version) {
      throw new NotFoundException('Version not found');
    }

    // Delete from S3 if it has a different key than the current file
    if (version.key !== file.key) {
      try {
        await this.s3.deleteFile(file.bucket.garageBucketId, version.key);
      } catch (error) {
        this.logger.warn(`Failed to delete version S3 object: ${(error as Error).message}`);
      }
    }

    await this.prisma.fileVersion.delete({ where: { id: versionId } });
  }

  async scanDuplicates(appId: string, bucketId: string) {
    const bucket = await this.prisma.bucket.findFirst({
      where: { id: bucketId, applicationId: appId },
    });

    if (!bucket) {
      throw new NotFoundException('Bucket not found');
    }

    // Find files with duplicate checksums within this bucket
    const duplicates = await this.prisma.$queryRaw<
      Array<{ checksum: string; count: bigint; total_size: bigint }>
    >`
      SELECT checksum, COUNT(*) as count, SUM(size_bytes) as total_size
      FROM files
      WHERE bucket_id = ${bucketId}
        AND deleted_at IS NULL
        AND checksum IS NOT NULL
      GROUP BY checksum
      HAVING COUNT(*) > 1
      ORDER BY SUM(size_bytes) DESC
    `;

    const groups = await Promise.all(
      duplicates.map(async (dup) => {
        const files = await this.prisma.file.findMany({
          where: {
            bucketId,
            checksum: dup.checksum,
            deletedAt: null,
          },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            key: true,
            originalName: true,
            sizeBytes: true,
            createdAt: true,
          },
        });

        return {
          checksum: dup.checksum,
          count: Number(dup.count),
          totalSize: Number(dup.total_size),
          wastedSize: Number(dup.total_size) - Number(files[0]?.sizeBytes || 0),
          files: files.map((f) => ({
            ...f,
            sizeBytes: Number(f.sizeBytes),
          })),
        };
      }),
    );

    const totalWasted = groups.reduce((acc, g) => acc + g.wastedSize, 0);

    return {
      duplicateGroups: groups.length,
      totalDuplicateFiles: groups.reduce((acc, g) => acc + g.count, 0),
      totalWastedBytes: totalWasted,
      groups,
    };
  }

  /**
   * Sync files from Garage S3 bucket to the database
   * Imports files that exist in S3 but not in the database
   */
  async syncFilesFromGarage(bucketId: string): Promise<{
    synced: number;
    skipped: number;
    totalInS3: number;
    newUsedBytes: number;
  }> {
    const bucket = await this.prisma.bucket.findUnique({
      where: { id: bucketId },
      include: { application: true },
    });

    if (!bucket) {
      throw new NotFoundException('Bucket not found');
    }

    // Get existing file keys from database
    const existingFiles = await this.prisma.file.findMany({
      where: { bucketId },
      select: { key: true },
    });
    const existingKeys = new Set(existingFiles.map((f) => f.key));

    // List all files from S3
    let continuationToken: string | undefined;
    let synced = 0;
    let skipped = 0;
    let totalInS3 = 0;
    let totalNewBytes = BigInt(0);

    do {
      const result = await this.s3.listFiles(
        bucket.garageBucketId,
        undefined,
        1000,
        continuationToken,
      );

      totalInS3 += result.files.length;

      for (const s3File of result.files) {
        // Skip system files (thumbnails, etc.)
        if (s3File.key.startsWith('_thumbnails/') || s3File.key.startsWith('_system/')) {
          skipped++;
          continue;
        }

        if (existingKeys.has(s3File.key)) {
          skipped++;
          continue;
        }

        try {
          // Get file metadata from S3
          const metadata = await this.s3.getFileMetadata(
            bucket.garageBucketId,
            s3File.key,
          );

          // Create file record
          await this.prisma.file.create({
            data: {
              bucketId,
              key: s3File.key,
              originalName: s3File.key.split('/').pop() || s3File.key,
              mimeType: metadata.contentType,
              sizeBytes: BigInt(metadata.contentLength),
              etag: metadata.etag,
              isPublic: bucket.isPublic,
            },
          });

          totalNewBytes += BigInt(metadata.contentLength);
          synced++;
          this.logger.log(`Synced file: ${s3File.key}`);
        } catch (error) {
          this.logger.error(`Failed to sync file ${s3File.key}: ${(error as Error).message}`);
          skipped++;
        }
      }

      continuationToken = result.nextToken;
    } while (continuationToken);

    // Update bucket usage stats
    if (totalNewBytes > BigInt(0)) {
      await this.prisma.bucket.update({
        where: { id: bucketId },
        data: { usedBytes: { increment: totalNewBytes } },
      });

      await this.prisma.application.update({
        where: { id: bucket.applicationId },
        data: { usedStorageBytes: { increment: totalNewBytes } },
      });
    }

    return {
      synced,
      skipped,
      totalInS3,
      newUsedBytes: Number(totalNewBytes),
    };
  }

  // Copy file to another bucket (or same bucket with different key)
  async copyFile(appId: string, bucketId: string, fileId: string, dto: CopyFileDto) {
    const sourceFile = await this.getFileWithBucket(bucketId, fileId);

    // Verify source bucket belongs to app
    const sourceBucket = await this.prisma.bucket.findFirst({
      where: { id: bucketId, applicationId: appId },
    });
    if (!sourceBucket) {
      throw new NotFoundException('Source bucket not found');
    }

    // Verify target bucket belongs to app
    const targetBucket = await this.prisma.bucket.findFirst({
      where: { id: dto.targetBucketId, applicationId: appId },
      include: { application: true },
    });
    if (!targetBucket) {
      throw new NotFoundException('Target bucket not found');
    }

    // Check quota
    const newUsage = Number(targetBucket.application.usedStorageBytes) + Number(sourceFile.sizeBytes);
    if (newUsage > Number(targetBucket.application.maxStorageBytes)) {
      throw new ForbiddenException('Application storage quota exceeded');
    }

    const newKey = dto.newKey || sourceFile.key;

    // Copy file in S3
    await this.s3.copyFile(
      sourceBucket.garageBucketId,
      sourceFile.key,
      targetBucket.garageBucketId,
      newKey,
    );

    // Create new file record
    const newFile = await this.prisma.file.create({
      data: {
        bucketId: dto.targetBucketId,
        key: newKey,
        originalName: sourceFile.originalName,
        mimeType: sourceFile.mimeType,
        sizeBytes: sourceFile.sizeBytes,
        etag: sourceFile.etag,
        metadata: sourceFile.metadata as any,
        isPublic: sourceFile.isPublic,
      },
    });

    // Update usage stats
    await this.updateUsageStats(appId, dto.targetBucketId, sourceFile.sizeBytes);

    // Trigger webhook
    await this.webhooks.trigger(appId, 'file.copied', {
      sourceFileId: fileId,
      newFileId: newFile.id,
      sourceBucket: sourceBucket.name,
      targetBucket: targetBucket.name,
    });

    return this.formatFileResponse(newFile, targetBucket.garageBucketId);
  }

  // Move file to another bucket
  async moveFile(appId: string, bucketId: string, fileId: string, dto: MoveFileDto) {
    const sourceFile = await this.getFileWithBucket(bucketId, fileId);

    // Can't move to same bucket
    if (dto.targetBucketId === bucketId && !dto.newKey) {
      throw new BadRequestException('Must specify newKey when moving within same bucket');
    }

    // Verify source bucket belongs to app
    const sourceBucket = await this.prisma.bucket.findFirst({
      where: { id: bucketId, applicationId: appId },
    });
    if (!sourceBucket) {
      throw new NotFoundException('Source bucket not found');
    }

    // Verify target bucket belongs to app
    const targetBucket = await this.prisma.bucket.findFirst({
      where: { id: dto.targetBucketId, applicationId: appId },
    });
    if (!targetBucket) {
      throw new NotFoundException('Target bucket not found');
    }

    const newKey = dto.newKey || sourceFile.key;

    // Copy file in S3 to new location
    await this.s3.copyFile(
      sourceBucket.garageBucketId,
      sourceFile.key,
      targetBucket.garageBucketId,
      newKey,
    );

    // Delete old file from S3
    await this.s3.deleteFile(sourceBucket.garageBucketId, sourceFile.key);

    // Update file record
    const updatedFile = await this.prisma.file.update({
      where: { id: fileId },
      data: {
        bucketId: dto.targetBucketId,
        key: newKey,
      },
    });

    // Update usage stats (subtract from source, add to target)
    if (dto.targetBucketId !== bucketId) {
      await this.prisma.bucket.update({
        where: { id: bucketId },
        data: { usedBytes: { decrement: sourceFile.sizeBytes } },
      });
      await this.prisma.bucket.update({
        where: { id: dto.targetBucketId },
        data: { usedBytes: { increment: sourceFile.sizeBytes } },
      });
    }

    // Trigger webhook
    await this.webhooks.trigger(appId, 'file.moved', {
      fileId,
      fromBucket: sourceBucket.name,
      toBucket: targetBucket.name,
      newKey,
    });

    return this.formatFileResponse(updatedFile, targetBucket.garageBucketId);
  }

  // Advanced search across all buckets
  async searchFiles(appId: string, dto: SearchFilesDto) {
    const { page = 1, limit = 50 } = dto;

    // Build where clause - exclude soft-deleted files
    const where: any = {
      bucket: { applicationId: appId },
      deletedAt: null,
    };

    // Filter by specific buckets if provided
    if (dto.bucketIds?.length) {
      where.bucketId = { in: dto.bucketIds };
    }

    // Text search in key, originalName
    if (dto.query) {
      where.OR = [
        { key: { contains: dto.query, mode: 'insensitive' } },
        { originalName: { contains: dto.query, mode: 'insensitive' } },
      ];
    }

    // Filter by tags
    if (dto.tagIds?.length) {
      where.tags = {
        some: { tagId: { in: dto.tagIds } },
      };
    }

    // Filter by MIME types
    if (dto.mimeTypes?.length) {
      where.OR = where.OR || [];
      for (const mimeType of dto.mimeTypes) {
        where.OR.push({ mimeType: { startsWith: mimeType } });
      }
    }

    // Date filters
    if (dto.dateFrom || dto.dateTo) {
      where.createdAt = {};
      if (dto.dateFrom) where.createdAt.gte = new Date(dto.dateFrom);
      if (dto.dateTo) where.createdAt.lte = new Date(dto.dateTo);
    }

    // Size filters
    if (dto.sizeMin !== undefined || dto.sizeMax !== undefined) {
      where.sizeBytes = {};
      if (dto.sizeMin !== undefined) where.sizeBytes.gte = BigInt(dto.sizeMin);
      if (dto.sizeMax !== undefined) where.sizeBytes.lte = BigInt(dto.sizeMax);
    }

    const [files, total] = await Promise.all([
      this.prisma.file.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          bucket: { select: { id: true, name: true, garageBucketId: true } },
          tags: { include: { tag: true } },
        },
      }),
      this.prisma.file.count({ where }),
    ]);

    // Format results
    const data = await Promise.all(
      files.map(async (f) => {
        const formatted = await this.formatFileResponse(f, f.bucket.garageBucketId);
        return {
          ...formatted,
          bucket: { id: f.bucket.id, name: f.bucket.name },
        };
      }),
    );

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Get thumbnail URL for a file
  async getThumbnailUrl(appId: string, bucketId: string, fileId: string) {
    const file = await this.getFileWithBucket(bucketId, fileId);

    // Verify bucket belongs to app
    const bucket = await this.prisma.bucket.findFirst({
      where: { id: bucketId, applicationId: appId },
    });
    if (!bucket) {
      throw new NotFoundException('Bucket not found');
    }

    if (!file.thumbnailKey) {
      if (file.thumbnailStatus === 'PENDING') {
        return { status: 'pending', url: null };
      }
      if (file.thumbnailStatus === 'FAILED') {
        return { status: 'failed', url: null };
      }
      return { status: 'not_available', url: null };
    }

    const url = await this.s3.getPresignedDownloadUrl(
      bucket.garageBucketId,
      file.thumbnailKey,
      3600,
    );

    return {
      status: 'available',
      url,
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    };
  }

  // Request thumbnail regeneration
  async regenerateThumbnail(appId: string, bucketId: string, fileId: string) {
    const file = await this.getFileWithBucket(bucketId, fileId);

    // Verify bucket belongs to app
    const bucket = await this.prisma.bucket.findFirst({
      where: { id: bucketId, applicationId: appId },
    });
    if (!bucket) {
      throw new NotFoundException('Bucket not found');
    }

    // Check if file is an image
    if (!file.mimeType.startsWith('image/')) {
      throw new BadRequestException('Thumbnail generation only available for images');
    }

    // Use ProcessingService to queue thumbnail generation
    return this.processing.generateThumbnail(fileId);
  }
}
