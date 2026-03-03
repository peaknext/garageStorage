import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PaginationMeta {
  @ApiProperty({ example: 100 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 50 })
  limit: number;

  @ApiProperty({ example: 2 })
  totalPages: number;
}

export class FileResponseDto {
  @ApiProperty({ example: 'uuid-string' })
  id: string;

  @ApiProperty({ example: 'uploads/2024/01/abc123.pdf' })
  key: string;

  @ApiProperty({ example: 'document.pdf' })
  originalName: string;

  @ApiProperty({ example: 'application/pdf' })
  mimeType: string;

  @ApiProperty({ example: 102400 })
  sizeBytes: number;

  @ApiPropertyOptional({ example: 'abc123def456' })
  checksum?: string;

  @ApiProperty({ example: false })
  isPublic: boolean;

  @ApiProperty({ example: 5 })
  downloadCount: number;

  @ApiPropertyOptional({ example: 'https://s3.example.com/...' })
  url?: string;

  @ApiPropertyOptional({ example: 'https://s3.example.com/thumb/...' })
  thumbnailUrl?: string;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  createdAt: string;
}

export class BucketResponseDto {
  @ApiProperty({ example: 'uuid-string' })
  id: string;

  @ApiProperty({ example: 'my-bucket' })
  name: string;

  @ApiPropertyOptional({ example: 'A storage bucket' })
  description?: string;

  @ApiProperty({ example: false })
  isPublic: boolean;

  @ApiProperty({ example: 0 })
  fileCount: number;

  @ApiProperty({ example: 0 })
  usedBytes: number;

  @ApiPropertyOptional({ example: 1073741824 })
  quotaBytes?: number;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  createdAt: string;
}

export class ShareResponseDto {
  @ApiProperty({ example: 'uuid-string' })
  id: string;

  @ApiProperty({ example: 'abc123token' })
  token: string;

  @ApiProperty({ example: 'https://api.example.com/api/v1/shares/abc123token/download' })
  shareUrl: string;

  @ApiPropertyOptional({ example: '2024-02-01T00:00:00.000Z' })
  expiresAt?: string;

  @ApiPropertyOptional({ example: 10 })
  maxDownloads?: number;

  @ApiProperty({ example: 0 })
  downloadCount: number;

  @ApiProperty({ example: false })
  hasPassword: boolean;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  createdAt: string;
}

export class UploadPresignedResponseDto {
  @ApiProperty({ example: 'https://s3.example.com/bucket/key?X-Amz-...' })
  uploadUrl: string;

  @ApiProperty({ example: 'uuid-upload-id' })
  uploadId: string;

  @ApiProperty({ example: 'uploads/2024/01/abc123.pdf' })
  key: string;
}

export class DownloadUrlResponseDto {
  @ApiProperty({ example: 'https://s3.example.com/bucket/key?X-Amz-...' })
  url: string;

  @ApiProperty({ example: '2024-01-01T01:00:00.000Z' })
  expiresAt: string;
}
