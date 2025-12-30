import { IsOptional, IsBoolean, IsNumber, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateBucketDto {
  @ApiPropertyOptional({ description: 'New application ID to reassign bucket to' })
  @IsOptional()
  @IsUUID()
  applicationId?: string;

  @ApiPropertyOptional({ example: 5368709120 })
  @IsOptional()
  @IsNumber()
  quotaBytes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  corsEnabled?: boolean;
}
