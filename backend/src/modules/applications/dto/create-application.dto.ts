import {
  IsString,
  IsOptional,
  IsUrl,
  IsArray,
  IsNumber,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateApplicationDto {
  @ApiProperty({ example: 'My Application' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'my-application' })
  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Slug must contain only lowercase letters, numbers, and hyphens',
  })
  @MaxLength(50)
  slug: string;

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
}
