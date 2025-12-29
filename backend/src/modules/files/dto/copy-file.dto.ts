import { IsString, IsOptional, MaxLength, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CopyFileDto {
  @ApiProperty({
    description: 'Target bucket ID to copy the file to',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  targetBucketId: string;

  @ApiPropertyOptional({
    description: 'New file key/path. Uses original key if not provided.',
    example: 'documents/copy-report-2024.pdf',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  newKey?: string;
}
