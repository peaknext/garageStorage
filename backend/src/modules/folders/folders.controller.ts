import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
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
  ApiBody,
} from '@nestjs/swagger';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { CurrentApp } from '../../common/decorators/current-app.decorator';
import { FoldersService, CreateFolderDto } from './folders.service';

@ApiTags('folders')
@Controller()
@UseGuards(ApiKeyGuard)
@ApiSecurity('api-key')
export class FoldersController {
  constructor(private foldersService: FoldersService) {}

  @Get('buckets/:bucketId/folders')
  @ApiOperation({ summary: 'List folders in bucket (tree structure)' })
  async listFolders(
    @CurrentApp() app: { id: string },
    @Param('bucketId') bucketId: string,
  ) {
    return this.foldersService.findAllByBucketWithAppValidation(app.id, bucketId);
  }

  @Post('buckets/:bucketId/folders')
  @ApiOperation({ summary: 'Create a folder' })
  async createFolder(
    @CurrentApp() app: { id: string },
    @Param('bucketId') bucketId: string,
    @Body() dto: CreateFolderDto,
  ) {
    return this.foldersService.createWithAppValidation(app.id, bucketId, dto);
  }

  @Patch('folders/:id')
  @ApiOperation({ summary: 'Rename or move a folder' })
  async updateFolder(
    @CurrentApp() app: { id: string },
    @Param('id') id: string,
    @Body() dto: { name?: string; parentId?: string },
  ) {
    return this.foldersService.updateWithAppValidation(app.id, id, dto);
  }

  @Delete('folders/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a folder (and all contents)' })
  async deleteFolder(
    @CurrentApp() app: { id: string },
    @Param('id') id: string,
  ) {
    return this.foldersService.deleteWithAppValidation(app.id, id);
  }

  @Get('folders/:id/files')
  @ApiOperation({ summary: 'Get files in a folder' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getFilesInFolder(
    @CurrentApp() app: { id: string },
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.foldersService.getFilesInFolderWithAppValidation(
      app.id,
      id,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Get('folders/:id/breadcrumb')
  @ApiOperation({ summary: 'Get folder breadcrumb path' })
  async getFolderBreadcrumb(
    @CurrentApp() app: { id: string },
    @Param('id') id: string,
  ) {
    return this.foldersService.getFolderBreadcrumbWithAppValidation(app.id, id);
  }

  @Post('buckets/:bucketId/files/:fileId/folders')
  @ApiOperation({ summary: 'Add file to a folder' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        folderId: { type: 'string' },
      },
    },
  })
  async addFileToFolder(
    @CurrentApp() app: { id: string },
    @Param('bucketId') bucketId: string,
    @Param('fileId') fileId: string,
    @Body('folderId') folderId: string,
  ) {
    return this.foldersService.addFileToFolderWithAppValidation(app.id, fileId, folderId);
  }

  @Delete('buckets/:bucketId/files/:fileId/folders/:folderId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove file from a folder' })
  async removeFileFromFolder(
    @CurrentApp() app: { id: string },
    @Param('fileId') fileId: string,
    @Param('folderId') folderId: string,
  ) {
    return this.foldersService.removeFileFromFolderWithAppValidation(app.id, fileId, folderId);
  }
}
