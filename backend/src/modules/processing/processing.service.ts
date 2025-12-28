import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from '../../services/s3/s3.service';
import { ThumbnailStatus } from '@prisma/client';

export interface ThumbnailOptions {
  width?: number;
  height?: number;
  format?: 'webp' | 'jpeg' | 'png';
  quality?: number;
}

@Injectable()
export class ProcessingService {
  private readonly logger = new Logger(ProcessingService.name);

  constructor(
    private prisma: PrismaService,
    private s3: S3Service,
    private configService: ConfigService,
    @InjectQueue('thumbnail') private thumbnailQueue: Queue,
  ) {}

  /**
   * Queue thumbnail generation for a file
   */
  async generateThumbnail(fileId: string, options?: ThumbnailOptions) {
    const file = await this.prisma.file.findUnique({
      where: { id: fileId },
      include: { bucket: true },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    // Check if it's an image
    if (!this.isImageMimeType(file.mimeType)) {
      await this.prisma.file.update({
        where: { id: fileId },
        data: { thumbnailStatus: ThumbnailStatus.NOT_APPLICABLE },
      });
      return { status: 'not_applicable', message: 'File is not an image' };
    }

    // Mark as pending
    await this.prisma.file.update({
      where: { id: fileId },
      data: { thumbnailStatus: ThumbnailStatus.PENDING },
    });

    // Add to queue
    const job = await this.thumbnailQueue.add('generate', {
      fileId,
      bucketId: file.bucketId,
      garageBucketId: file.bucket.garageBucketId,
      key: file.key,
      mimeType: file.mimeType,
      options: {
        width: options?.width || this.configService.get('processing.thumbnail.width'),
        height: options?.height || this.configService.get('processing.thumbnail.height'),
        format: options?.format || this.configService.get('processing.thumbnail.format'),
        quality: options?.quality || this.configService.get('processing.thumbnail.quality'),
      },
    });

    return { status: 'queued', jobId: job.id };
  }

  /**
   * Get thumbnail URL for a file
   */
  async getThumbnailUrl(fileId: string, expiresIn = 3600) {
    const file = await this.prisma.file.findUnique({
      where: { id: fileId },
      include: { bucket: true },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    if (file.thumbnailStatus !== ThumbnailStatus.GENERATED || !file.thumbnailKey) {
      return {
        available: false,
        status: file.thumbnailStatus,
        message: this.getThumbnailStatusMessage(file.thumbnailStatus),
      };
    }

    const url = await this.s3.getPresignedDownloadUrl(
      file.bucket.garageBucketId,
      file.thumbnailKey,
      expiresIn,
    );

    return {
      available: true,
      url,
      width: file.imageWidth,
      height: file.imageHeight,
    };
  }

  /**
   * Get preview URL for a file
   */
  async getPreviewUrl(fileId: string, expiresIn = 3600) {
    const file = await this.prisma.file.findUnique({
      where: { id: fileId },
      include: { bucket: true },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    const url = await this.s3.getPresignedDownloadUrl(
      file.bucket.garageBucketId,
      file.key,
      expiresIn,
    );

    return {
      url,
      mimeType: file.mimeType,
      originalName: file.originalName,
      sizeBytes: Number(file.sizeBytes),
      previewType: this.getPreviewType(file.mimeType),
    };
  }

  /**
   * Regenerate thumbnails for all images in a bucket
   */
  async regenerateBucketThumbnails(bucketId: string) {
    const files = await this.prisma.file.findMany({
      where: {
        bucketId,
        mimeType: { startsWith: 'image/' },
      },
      select: { id: true },
    });

    let queued = 0;
    for (const file of files) {
      await this.generateThumbnail(file.id);
      queued++;
    }

    return { queued, total: files.length };
  }

  private isImageMimeType(mimeType: string): boolean {
    return ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif', 'image/bmp'].includes(
      mimeType,
    );
  }

  private getThumbnailStatusMessage(status: ThumbnailStatus): string {
    switch (status) {
      case ThumbnailStatus.NONE:
        return 'Thumbnail not generated yet';
      case ThumbnailStatus.PENDING:
        return 'Thumbnail generation in progress';
      case ThumbnailStatus.FAILED:
        return 'Thumbnail generation failed';
      case ThumbnailStatus.NOT_APPLICABLE:
        return 'File type does not support thumbnails';
      default:
        return 'Unknown status';
    }
  }

  private getPreviewType(mimeType: string): string {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType === 'application/pdf') return 'pdf';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('text/') || mimeType === 'application/json') return 'text';
    return 'download';
  }
}
