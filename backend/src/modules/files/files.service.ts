import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from '../../services/s3/s3.service';
import { CacheService } from '../../services/cache/cache.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { PresignedUploadDto } from './dto/presigned-upload.dto';
import { ConfirmUploadDto } from './dto/confirm-upload.dto';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private prisma: PrismaService,
    private s3: S3Service,
    private cache: CacheService,
    private webhooks: WebhooksService,
  ) {}

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

    const bucket = await this.getBucketWithQuotaCheck(appId, bucketId, file.size);
    const key = dto.key || this.generateFileKey(file.mimetype, file.originalname);

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
        originalName: file.originalname,
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

    return {
      url,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    };
  }

  async deleteFile(appId: string, bucketId: string, fileId: string) {
    const file = await this.getFileWithBucket(bucketId, fileId);

    await this.s3.deleteFile(file.bucket.garageBucketId, file.key);
    await this.prisma.file.delete({ where: { id: fileId } });
    await this.updateUsageStats(appId, bucketId, -file.sizeBytes);

    await this.webhooks.trigger(appId, 'file.deleted', {
      fileId,
      key: file.key,
      bucket: file.bucket.name,
    });
  }

  async bulkDelete(appId: string, bucketId: string, fileIds: string[]) {
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
        await this.deleteFile(appId, bucketId, fileId);
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
    },
  ) {
    const {
      page = 1,
      limit = 50,
      prefix,
      mimeType,
      sort = 'createdAt',
      order = 'desc',
    } = query;

    const bucket = await this.prisma.bucket.findFirst({
      where: { id: bucketId, applicationId: appId },
    });

    if (!bucket) {
      throw new NotFoundException('Bucket not found');
    }

    const where: any = { bucketId };
    if (prefix) {
      where.key = { startsWith: prefix };
    }
    if (mimeType) {
      where.mimeType = { startsWith: mimeType };
    }

    const [files, total] = await Promise.all([
      this.prisma.file.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sort]: order },
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
    dto: { metadata?: Record<string, any>; isPublic?: boolean },
  ) {
    const file = await this.getFileWithBucket(bucketId, fileId);

    const updated = await this.prisma.file.update({
      where: { id: fileId },
      data: {
        metadata: dto.metadata,
        isPublic: dto.isPublic,
      },
    });

    return {
      id: updated.id,
      updatedAt: updated.updatedAt,
    };
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

    return {
      id: file.id,
      key: file.key,
      originalName: file.originalName,
      mimeType: file.mimeType,
      sizeBytes: Number(file.sizeBytes),
      isPublic: file.isPublic,
      downloadCount: file.downloadCount,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
      url,
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
}
