import {
  IsString,
  IsOptional,
  IsUrl,
  IsArray,
  IsNumber,
  IsEnum,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

enum AppStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
}

export class UpdateApplicationDto {
  @ApiPropertyOptional({ example: 'My Application' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: 'Description of my application' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ example: 'https://example.com/webhook' })
  @IsOptional()
  @IsUrl()
  webhookUrl?: string;

  @ApiPropertyOptional({
    example: ['https://example.com', 'https://app.example.com'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedOrigins?: string[];

  @ApiPropertyOptional({ example: 10737418240 })
  @IsOptional()
  @IsNumber()
  maxStorageBytes?: number;

  @ApiPropertyOptional({ enum: AppStatus })
  @IsOptional()
  @IsEnum(AppStatus)
  status?: AppStatus;
}
