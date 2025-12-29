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
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiSecurity,
  ApiQuery,
} from '@nestjs/swagger';
import { RecycleBinService } from './recycle-bin.service';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { CurrentApp } from '../../common/decorators/current-app.decorator';

@ApiTags('recycle-bin')
@Controller('recycle-bin')
@UseGuards(ApiKeyGuard)
@ApiSecurity('api-key')
export class RecycleBinController {
  constructor(private recycleBinService: RecycleBinService) {}

  @Get()
  @ApiOperation({ summary: 'List all deleted files for this application' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async listDeletedFiles(
    @CurrentApp() app: { id: string },
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.recycleBinService.listDeletedFiles({
      applicationId: app.id,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get recycle bin statistics' })
  async getStats(@CurrentApp() app: { id: string }) {
    return this.recycleBinService.getStats(app.id);
  }

  @Post(':fileId/restore')
  @ApiOperation({ summary: 'Restore a soft-deleted file' })
  async restore(
    @CurrentApp() app: { id: string },
    @Param('fileId') fileId: string,
  ) {
    return this.recycleBinService.restore(app.id, fileId);
  }

  @Delete(':fileId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Permanently delete a file from recycle bin' })
  async permanentDelete(
    @CurrentApp() app: { id: string },
    @Param('fileId') fileId: string,
  ) {
    return this.recycleBinService.permanentDelete(app.id, fileId, 'manual');
  }

  @Post('purge')
  @ApiOperation({ summary: 'Empty recycle bin (permanently delete all deleted files)' })
  async purgeAll(@CurrentApp() app: { id: string }) {
    return this.recycleBinService.emptyRecycleBin(app.id);
  }
}

@ApiTags('recycle-bin')
@Controller('buckets/:bucketId/recycle-bin')
@UseGuards(ApiKeyGuard)
@ApiSecurity('api-key')
export class BucketRecycleBinController {
  constructor(private recycleBinService: RecycleBinService) {}

  @Get()
  @ApiOperation({ summary: 'List deleted files in a specific bucket' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async listDeletedFiles(
    @CurrentApp() app: { id: string },
    @Param('bucketId') bucketId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.recycleBinService.listDeletedFiles({
      applicationId: app.id,
      bucketId,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }

  @Post('purge')
  @ApiOperation({ summary: 'Empty bucket recycle bin' })
  async purgeBucket(
    @CurrentApp() app: { id: string },
    @Param('bucketId') bucketId: string,
  ) {
    return this.recycleBinService.emptyRecycleBin(app.id, bucketId);
  }
}
