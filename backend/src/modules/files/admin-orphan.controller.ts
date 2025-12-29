import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrphanService, OrphanScanResult, CleanupResult } from './orphan.service';

@ApiTags('admin-orphan-files')
@Controller('admin/orphan-files')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminOrphanController {
  constructor(private orphanService: OrphanService) {}

  @Get('scan')
  @ApiOperation({
    summary: 'Scan for orphan files',
    description:
      'Scans for orphan files in both directions: DB records without S3 files and S3 files without DB records',
  })
  @ApiQuery({
    name: 'bucketId',
    required: false,
    type: String,
    description: 'Optional bucket ID to scan only one bucket',
  })
  async scanForOrphans(
    @Query('bucketId') bucketId?: string,
  ): Promise<OrphanScanResult> {
    return this.orphanService.scanForOrphans(bucketId);
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Get orphan statistics',
    description: 'Get quick statistics about orphan files without full details',
  })
  @ApiQuery({
    name: 'bucketId',
    required: false,
    type: String,
    description: 'Optional bucket ID to get stats for one bucket',
  })
  async getOrphanStats(
    @Query('bucketId') bucketId?: string,
  ): Promise<OrphanScanResult['stats']> {
    return this.orphanService.getOrphanStats(bucketId);
  }

  @Post('cleanup/db')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cleanup orphan DB records',
    description:
      'Delete database records for files that no longer exist in S3 storage',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        fileIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list of specific file IDs to cleanup',
        },
        bucketId: {
          type: 'string',
          description: 'Optional bucket ID to limit cleanup to one bucket',
        },
      },
    },
  })
  async cleanupDbOrphans(
    @Body('fileIds') fileIds?: string[],
    @Body('bucketId') bucketId?: string,
  ): Promise<CleanupResult> {
    return this.orphanService.cleanupDbOrphans(fileIds, bucketId);
  }

  @Post('cleanup/s3')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cleanup orphan S3 files',
    description:
      'Delete S3 files that have no corresponding database records',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        orphans: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              key: { type: 'string' },
              garageBucketId: { type: 'string' },
            },
          },
          description: 'Optional list of specific orphans to cleanup',
        },
        bucketId: {
          type: 'string',
          description: 'Optional bucket ID to limit cleanup to one bucket',
        },
      },
    },
  })
  async cleanupS3Orphans(
    @Body('orphans') orphans?: Array<{ key: string; garageBucketId: string }>,
    @Body('bucketId') bucketId?: string,
  ): Promise<CleanupResult> {
    return this.orphanService.cleanupS3Orphans(orphans, bucketId);
  }

  @Post('cleanup/all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cleanup all orphan files',
    description:
      'Delete all orphan files in both directions: DB records without S3 files and S3 files without DB records',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        bucketId: {
          type: 'string',
          description: 'Optional bucket ID to limit cleanup to one bucket',
        },
      },
    },
  })
  async cleanupAllOrphans(
    @Body('bucketId') bucketId?: string,
  ): Promise<CleanupResult> {
    return this.orphanService.cleanupAllOrphans(bucketId);
  }
}
