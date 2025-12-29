import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { RecycleBinService } from './recycle-bin.service';

@ApiTags('admin-recycle-bin')
@Controller('admin/recycle-bin')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminRecycleBinController {
  constructor(
    private recycleBinService: RecycleBinService,
    private prisma: PrismaService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all deleted files globally' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'applicationId', required: false, type: String })
  async listAllDeletedFiles(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('applicationId') applicationId?: string,
  ) {
    return this.recycleBinService.listDeletedFiles({
      applicationId,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get global recycle bin statistics' })
  @ApiQuery({ name: 'applicationId', required: false, type: String })
  async getStats(@Query('applicationId') applicationId?: string) {
    return this.recycleBinService.getStats(applicationId);
  }

  @Post(':fileId/restore')
  @ApiOperation({ summary: 'Restore a soft-deleted file' })
  async restore(@Param('fileId') fileId: string) {
    // Find the file to get its application ID
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, deletedAt: { not: null } },
      include: { bucket: true },
    });

    if (!file) {
      throw new NotFoundException('Deleted file not found');
    }

    return this.recycleBinService.restore(file.bucket.applicationId, fileId);
  }

  @Delete(':fileId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Permanently delete a file from recycle bin' })
  async permanentDelete(@Param('fileId') fileId: string) {
    // Find the file to get its application ID
    const file = await this.prisma.file.findFirst({
      where: { id: fileId, deletedAt: { not: null } },
      include: { bucket: true },
    });

    if (!file) {
      throw new NotFoundException('Deleted file not found');
    }

    return this.recycleBinService.permanentDelete(
      file.bucket.applicationId,
      fileId,
      'manual',
    );
  }

  @Post('purge')
  @ApiOperation({ summary: 'Empty all recycle bins (all applications)' })
  @ApiQuery({ name: 'applicationId', required: false, type: String })
  async purgeAll(@Query('applicationId') applicationId?: string) {
    if (applicationId) {
      return this.recycleBinService.emptyRecycleBin(applicationId);
    }

    // Purge for all applications
    const apps = await this.prisma.application.findMany({
      select: { id: true },
    });

    let totalDeleted = 0;
    let totalFreed = BigInt(0);
    const allFailed: string[] = [];

    for (const app of apps) {
      const result = await this.recycleBinService.emptyRecycleBin(app.id);
      totalDeleted += result.deletedCount;
      totalFreed += BigInt(result.freedBytes);
      allFailed.push(...result.failed);
    }

    return {
      deletedCount: totalDeleted,
      freedBytes: Number(totalFreed),
      failed: allFailed,
    };
  }
}

@ApiTags('admin-recycle-bin')
@Controller('admin/buckets/:bucketId/recycle-bin')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminBucketRecycleBinController {
  constructor(
    private recycleBinService: RecycleBinService,
    private prisma: PrismaService,
  ) {}

  private async getBucketWithApp(bucketId: string) {
    const bucket = await this.prisma.bucket.findUnique({
      where: { id: bucketId },
    });

    if (!bucket) {
      throw new NotFoundException('Bucket not found');
    }

    return bucket;
  }

  @Get()
  @ApiOperation({ summary: 'List deleted files in a specific bucket' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async listDeletedFiles(
    @Param('bucketId') bucketId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const bucket = await this.getBucketWithApp(bucketId);
    return this.recycleBinService.listDeletedFiles({
      applicationId: bucket.applicationId,
      bucketId,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get bucket recycle bin statistics' })
  async getStats(@Param('bucketId') bucketId: string) {
    await this.getBucketWithApp(bucketId);
    return this.recycleBinService.getStats(undefined, bucketId);
  }

  @Post('purge')
  @ApiOperation({ summary: 'Empty bucket recycle bin' })
  async purgeBucket(@Param('bucketId') bucketId: string) {
    const bucket = await this.getBucketWithApp(bucketId);
    return this.recycleBinService.emptyRecycleBin(bucket.applicationId, bucketId);
  }
}
