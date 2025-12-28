import { IsOptional, IsBoolean, IsNumber } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateBucketDto {
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
