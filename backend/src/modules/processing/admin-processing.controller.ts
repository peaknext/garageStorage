import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ProcessingService } from './processing.service';

@ApiTags('admin-processing')
@Controller('admin/buckets/:bucketId')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminProcessingController {
  constructor(private processingService: ProcessingService) {}

  @Get('files/:fileId/thumbnail')
  @ApiOperation({ summary: 'Get thumbnail URL for a file' })
  @ApiQuery({ name: 'expiresIn', required: false, type: Number })
  async getThumbnailUrl(
    @Param('fileId') fileId: string,
    @Query('expiresIn') expiresIn?: string,
  ) {
    return this.processingService.getThumbnailUrl(
      fileId,
      expiresIn ? parseInt(expiresIn, 10) : 3600,
    );
  }

  @Post('files/:fileId/thumbnail')
  @ApiOperation({ summary: 'Generate thumbnail for a file' })
  async generateThumbnail(@Param('fileId') fileId: string) {
    return this.processingService.generateThumbnail(fileId);
  }

  @Get('files/:fileId/preview')
  @ApiOperation({ summary: 'Get preview URL for a file' })
  @ApiQuery({ name: 'expiresIn', required: false, type: Number })
  async getPreviewUrl(
    @Param('fileId') fileId: string,
    @Query('expiresIn') expiresIn?: string,
  ) {
    return this.processingService.getPreviewUrl(
      fileId,
      expiresIn ? parseInt(expiresIn, 10) : 3600,
    );
  }

  @Post('processing/thumbnails/regenerate')
  @ApiOperation({ summary: 'Regenerate thumbnails for all images in bucket' })
  async regenerateThumbnails(@Param('bucketId') bucketId: string) {
    return this.processingService.regenerateBucketThumbnails(bucketId);
  }
}
