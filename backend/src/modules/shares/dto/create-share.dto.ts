import { IsOptional, IsNumber, IsString, IsBoolean, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateShareDto {
  @ApiPropertyOptional({
    description: 'Expiration time in seconds',
    example: 86400,
  })
  @IsOptional()
  @IsNumber()
  @Min(60)
  expiresIn?: number;

  @ApiPropertyOptional({
    description: 'Maximum number of downloads',
    example: 10,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxDownloads?: number;

  @ApiPropertyOptional({
    description: 'Password protection',
    example: 'secret123',
  })
  @IsOptional()
  @IsString()
  password?: string;

  @ApiPropertyOptional({
    description: 'Allow file preview',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  allowPreview?: boolean;
}
