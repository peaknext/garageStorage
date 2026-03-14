import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import * as sharp from 'sharp';
import { PrismaService } from '../../../prisma/prisma.service';
import { S3Service } from '../../../services/s3/s3.service';
import { ThumbnailStatus } from '@prisma/client';

interface ThumbnailJobData {
  fileId: string;
  bucketId: string;
  s3BucketId: string;
  key: string;
  mimeType: string;
  options: {
    width: number;
    height: number;
    format: 'webp' | 'jpeg' | 'png';
    quality: number;
  };
}

@Processor('thumbnail')
export class ThumbnailProcessor {
  private readonly logger = new Logger(ThumbnailProcessor.name);

  constructor(
    private prisma: PrismaService,
    private s3: S3Service,
  ) {}

  @Process('generate')
  async handleThumbnailGeneration(job: Job<ThumbnailJobData>) {
    const { fileId, s3BucketId, key, options } = job.data;
    this.logger.log(`Generating thumbnail for file ${fileId}`);

    try {
      // Download original file from S3
      const originalData = await this.s3.downloadFile(s3BucketId, key);

      // Process with Sharp
      let sharpInstance = sharp(originalData);

      // Get original dimensions
      const metadata = await sharpInstance.metadata();
      const originalWidth = metadata.width || 0;
      const originalHeight = metadata.height || 0;

      // Resize maintaining aspect ratio
      sharpInstance = sharpInstance.resize(options.width, options.height, {
        fit: 'inside',
        withoutEnlargement: true,
      });

      // Set format and quality
      switch (options.format) {
        case 'webp':
          sharpInstance = sharpInstance.webp({ quality: options.quality });
          break;
        case 'jpeg':
          sharpInstance = sharpInstance.jpeg({ quality: options.quality });
          break;
        case 'png':
          sharpInstance = sharpInstance.png({ quality: options.quality });
          break;
      }

      const thumbnailBuffer = await sharpInstance.toBuffer();

      // Generate thumbnail key
      const thumbnailKey = `_thumbnails/${fileId}.${options.format}`;

      // Upload thumbnail to S3
      await this.s3.uploadFile(
        s3BucketId,
        thumbnailKey,
        thumbnailBuffer,
        `image/${options.format}`,
      );

      // Update file record
      await this.prisma.file.update({
        where: { id: fileId },
        data: {
          thumbnailKey,
          thumbnailStatus: ThumbnailStatus.GENERATED,
          imageWidth: originalWidth,
          imageHeight: originalHeight,
        },
      });

      this.logger.log(`Thumbnail generated for file ${fileId}: ${thumbnailKey}`);
      return { success: true, thumbnailKey };
    } catch (error) {
      this.logger.error(`Failed to generate thumbnail for file ${fileId}: ${error.message}`, error.stack);

      // Update status to failed
      await this.prisma.file.update({
        where: { id: fileId },
        data: { thumbnailStatus: ThumbnailStatus.FAILED },
      });

      throw error;
    }
  }
}
