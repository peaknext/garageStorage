import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  CreateBucketCommand,
  DeleteBucketCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class S3Service {
  private readonly s3Client: S3Client;
  private readonly s3PublicClient: S3Client;
  private readonly logger = new Logger(S3Service.name);

  constructor(private configService: ConfigService) {
    const internalEndpoint = this.configService.get('garage.endpoint') || 'http://localhost:9004';
    const publicEndpoint = this.configService.get('garage.publicEndpoint') || internalEndpoint;
    const region = this.configService.get('garage.region', 'garage');
    const credentials = {
      accessKeyId: this.configService.get('garage.accessKey') || '',
      secretAccessKey: this.configService.get('garage.secretKey') || '',
    };

    // Internal client for server-side operations (uses Docker network hostname)
    this.s3Client = new S3Client({
      endpoint: internalEndpoint,
      region,
      credentials,
      forcePathStyle: true, // Required for Garage
    });

    // Public client for generating presigned URLs (uses public hostname)
    this.s3PublicClient = new S3Client({
      endpoint: publicEndpoint,
      region,
      credentials,
      forcePathStyle: true, // Required for Garage
    });
  }

  /**
   * Create a new bucket in Garage
   */
  async createBucket(bucketName: string): Promise<void> {
    const command = new CreateBucketCommand({ Bucket: bucketName });
    await this.s3Client.send(command);
    this.logger.log(`Bucket created: ${bucketName}`);
  }

  /**
   * Delete a bucket from Garage
   */
  async deleteBucket(bucketName: string): Promise<void> {
    const command = new DeleteBucketCommand({ Bucket: bucketName });
    await this.s3Client.send(command);
    this.logger.log(`Bucket deleted: ${bucketName}`);
  }

  /**
   * Generate presigned URL for upload (uses public endpoint for browser access)
   */
  async getPresignedUploadUrl(
    bucket: string,
    key: string,
    contentType: string,
    expiresIn: number = 3600,
    metadata?: Record<string, string>,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
      Metadata: metadata,
    });

    return getSignedUrl(this.s3PublicClient, command, { expiresIn });
  }

  /**
   * Generate presigned URL for download (uses public endpoint for browser access)
   */
  async getPresignedDownloadUrl(
    bucket: string,
    key: string,
    expiresIn: number = 3600,
    filename?: string,
  ): Promise<string> {
    let contentDisposition: string | undefined;

    if (filename) {
      // Check if filename contains non-ASCII characters
      const hasNonAscii = /[^\x00-\x7F]/.test(filename);

      if (hasNonAscii) {
        // RFC 5987 encoding for non-ASCII filenames (Thai, Chinese, etc.)
        // Include ASCII fallback + UTF-8 encoded filename
        const asciiFilename = filename.replace(/[^\x00-\x7F]/g, '_');
        const encodedFilename = encodeURIComponent(filename);
        contentDisposition = `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`;
      } else {
        // Simple ASCII filename
        contentDisposition = `attachment; filename="${filename}"`;
      }
    }

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentDisposition: contentDisposition,
    });

    return getSignedUrl(this.s3PublicClient, command, { expiresIn });
  }

  /**
   * Upload file directly
   */
  async uploadFile(
    bucket: string,
    key: string,
    body: Buffer | Uint8Array,
    contentType: string,
    metadata?: Record<string, string>,
  ): Promise<{ etag: string }> {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      Metadata: metadata,
    });

    const response = await this.s3Client.send(command);
    return { etag: response.ETag || '' };
  }

  /**
   * Download file content as Buffer
   */
  async downloadFile(bucket: string, key: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    const response = await this.s3Client.send(command);

    if (!response.Body) {
      throw new Error('Empty response body');
    }

    // Convert stream to buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }

    return Buffer.concat(chunks);
  }

  /**
   * Delete file
   */
  async deleteFile(bucket: string, key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    await this.s3Client.send(command);
    this.logger.log(`File deleted: ${bucket}/${key}`);
  }

  /**
   * Delete multiple files
   */
  async deleteFiles(
    bucket: string,
    keys: string[],
  ): Promise<{ deleted: string[]; errors: string[] }> {
    const deleted: string[] = [];
    const errors: string[] = [];

    for (const key of keys) {
      try {
        await this.deleteFile(bucket, key);
        deleted.push(key);
      } catch (error) {
        errors.push(key);
        this.logger.error(`Failed to delete ${key}: ${(error as Error).message}`);
      }
    }

    return { deleted, errors };
  }

  /**
   * Check if file exists
   */
  async fileExists(bucket: string, key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      });
      await this.s3Client.send(command);
      return true;
    } catch (error) {
      if ((error as any).name === 'NotFound') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get file metadata from S3
   */
  async getFileMetadata(
    bucket: string,
    key: string,
  ): Promise<{
    contentType: string;
    contentLength: number;
    etag: string;
    lastModified: Date;
    metadata: Record<string, string>;
  }> {
    const command = new HeadObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    const response = await this.s3Client.send(command);

    return {
      contentType: response.ContentType || 'application/octet-stream',
      contentLength: response.ContentLength || 0,
      etag: response.ETag || '',
      lastModified: response.LastModified || new Date(),
      metadata: response.Metadata || {},
    };
  }

  /**
   * List files in bucket
   */
  async listFiles(
    bucket: string,
    prefix?: string,
    maxKeys: number = 1000,
    continuationToken?: string,
  ): Promise<{
    files: Array<{
      key: string;
      size: number;
      lastModified: Date;
      etag: string;
    }>;
    nextToken?: string;
  }> {
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      MaxKeys: maxKeys,
      ContinuationToken: continuationToken,
    });

    const response = await this.s3Client.send(command);

    return {
      files: (response.Contents || []).map((obj) => ({
        key: obj.Key || '',
        size: obj.Size || 0,
        lastModified: obj.LastModified || new Date(),
        etag: obj.ETag || '',
      })),
      nextToken: response.NextContinuationToken,
    };
  }

  /**
   * Copy file from one location to another (can be same or different bucket)
   */
  async copyFile(
    sourceBucket: string,
    sourceKey: string,
    targetBucket: string,
    targetKey: string,
  ): Promise<{ etag: string }> {
    const command = new CopyObjectCommand({
      Bucket: targetBucket,
      Key: targetKey,
      CopySource: `${sourceBucket}/${sourceKey}`,
    });

    const response = await this.s3Client.send(command);
    this.logger.log(`File copied: ${sourceBucket}/${sourceKey} -> ${targetBucket}/${targetKey}`);
    return { etag: response.CopyObjectResult?.ETag || '' };
  }
}
