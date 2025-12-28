import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AdminCreateBucketDto {
  @ApiProperty({ example: 'my-bucket' })
  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Bucket name must contain only lowercase letters, numbers, and hyphens',
  })
  @MaxLength(63)
  name: string;

  @ApiProperty({ example: 'uuid-of-application' })
  @IsUUID()
  applicationId: string;

  @ApiPropertyOptional({ example: 5368709120 })
  @IsOptional()
  @IsNumber()
  quotaBytes?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  corsEnabled?: boolean;
}
