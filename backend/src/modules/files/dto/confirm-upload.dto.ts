import { IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ConfirmUploadDto {
  @ApiProperty({
    description: 'Upload ID from presigned upload request',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsString()
  uploadId: string;

  @ApiPropertyOptional({
    description: 'ETag from S3 response',
    example: '"d41d8cd98f00b204e9800998ecf8427e"',
  })
  @IsOptional()
  @IsString()
  etag?: string;
}
