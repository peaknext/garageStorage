import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  MaxLength,
  Min,
  Max,
  IsObject,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PresignedUploadDto {
  @ApiPropertyOptional({
    description: 'File key/path. Auto-generated if not provided.',
    example: 'documents/report-2024.pdf',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  key?: string;

  @ApiProperty({
    description: 'File MIME type',
    example: 'application/pdf',
  })
  @IsString()
  contentType: string;

  @ApiProperty({
    description: 'File size in bytes',
    example: 1048576,
  })
  @IsNumber()
  @Min(1)
  @Max(5 * 1024 * 1024 * 1024) // 5GB max
  contentLength: number;

  @ApiPropertyOptional({
    description: 'Custom metadata',
    example: { originalName: 'report.pdf', category: 'documents' },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, string>;

  @ApiPropertyOptional({
    description: 'Make file publicly accessible',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}
