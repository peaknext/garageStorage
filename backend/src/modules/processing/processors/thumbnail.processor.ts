import { Process, Processor, OnQueueActive } from '@nestjs/bull';
import { Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bull';
import * as sharp from 'sharp';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PrismaService } from '../../../prisma/prisma.service';
import { S3Service } from '../../../services/s3/s3.service';
import { ThumbnailStatus } from '@prisma/client';
import {
  OFFICE_MIME_TYPES,
  checkLibreOfficeInstalled,
  convertPdfToImage,
  convertTextToImage,
  convertOfficeToPdf,
} from '../utils/document-converter';

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
export class ThumbnailProcessor implements OnModuleInit {
  private readonly logger = new Logger(ThumbnailProcessor.name);
  private libreOfficePath: string;
  private tempDir: string;
  private documentThumbnailEnabled: boolean;

  constructor(
    private prisma: PrismaService,
    private s3: S3Service,
    private config: ConfigService,
  ) {
    this.libreOfficePath = this.config.get<string>('processing.libreOfficePath') || 'soffice';
    this.tempDir = this.config.get<string>('processing.tempDir') || path.join(os.tmpdir(), 'skh-storage-processing');
    this.documentThumbnailEnabled = this.config.get<boolean>('processing.documentThumbnailEnabled') !== false;
  }

  async onModuleInit() {
    // Ensure temp directory exists
    await fs.promises.mkdir(this.tempDir, { recursive: true });
    this.logger.log(`Thumbnail temp dir: ${this.tempDir}`);

    // Check LibreOffice availability
    if (this.documentThumbnailEnabled) {
      const available = await checkLibreOfficeInstalled(this.libreOfficePath);
      if (!available) {
        this.logger.warn('Office document thumbnails disabled (LibreOffice not found). PDF and TXT thumbnails will still work.');
      }
    }
  }

  @Process('generate')
  async handleThumbnailGeneration(job: Job<ThumbnailJobData>) {
    const { fileId, s3BucketId, key, mimeType, options } = job.data;
    this.logger.log(`Generating thumbnail for file ${fileId} (${mimeType})`);

    try {
      // Download original file from S3
      const originalData = await this.s3.downloadFile(s3BucketId, key);

      // Route to appropriate conversion pipeline
      let imageBuffer: Buffer;

      if (this.isImage(mimeType)) {
        imageBuffer = originalData;
      } else if (mimeType === 'application/pdf') {
        imageBuffer = await convertPdfToImage(originalData, options);
      } else if (mimeType === 'text/plain') {
        imageBuffer = await convertTextToImage(originalData, options);
      } else if (OFFICE_MIME_TYPES.includes(mimeType)) {
        imageBuffer = await this.convertOfficeDocument(originalData, mimeType, options);
      } else {
        throw new Error(`Unsupported mimeType for thumbnail: ${mimeType}`);
      }

      // Common Sharp pipeline: resize + convert to target format
      const metadata = await sharp(imageBuffer).metadata();
      const originalWidth = metadata.width || 0;
      const originalHeight = metadata.height || 0;

      let sharpInstance = sharp(imageBuffer).resize(options.width, options.height, {
        fit: 'inside',
        withoutEnlargement: true,
      });

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
      const thumbnailKey = `_thumbnails/${fileId}.${options.format}`;

      // Upload thumbnail to S3
      await this.s3.uploadFile(s3BucketId, thumbnailKey, thumbnailBuffer, `image/${options.format}`);

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
      this.logger.error(`Failed to generate thumbnail for file ${fileId}: ${(error as Error).message}`, (error as Error).stack);

      await this.prisma.file.update({
        where: { id: fileId },
        data: { thumbnailStatus: ThumbnailStatus.FAILED },
      });

      throw error;
    }
  }

  private isImage(mimeType: string): boolean {
    return mimeType.startsWith('image/');
  }

  /**
   * Convert Office document → PDF → image
   */
  private async convertOfficeDocument(
    fileBuffer: Buffer,
    mimeType: string,
    options: { width: number; height: number },
  ): Promise<Buffer> {
    const available = await checkLibreOfficeInstalled(this.libreOfficePath);
    if (!available) {
      throw new Error(
        `LibreOffice not found at ${this.libreOfficePath}. Install LibreOffice to enable Office document thumbnails.`,
      );
    }

    // Office doc → PDF → image
    const pdfBuffer = await convertOfficeToPdf(fileBuffer, mimeType, this.libreOfficePath, this.tempDir);
    return convertPdfToImage(pdfBuffer, options);
  }
}
