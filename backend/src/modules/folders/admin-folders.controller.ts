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
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { FoldersService, CreateFolderDto } from './folders.service';

@ApiTags('admin-folders')
@Controller('admin')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminFoldersController {
  constructor(private foldersService: FoldersService) {}

  @Get('buckets/:bucketId/folders')
  @ApiOperation({ summary: 'List folders in a bucket (tree structure)' })
  async listFolders(@Param('bucketId') bucketId: string) {
    return this.foldersService.findAllByBucket(bucketId);
  }

  @Post('buckets/:bucketId/folders')
  @ApiOperation({ summary: 'Create a folder' })
  async createFolder(
    @Param('bucketId') bucketId: string,
    @Body() dto: CreateFolderDto,
  ) {
    return this.foldersService.create(bucketId, dto);
  }

  @Patch('folders/:id')
  @ApiOperation({ summary: 'Rename or move a folder' })
  async updateFolder(
    @Param('id') id: string,
    @Body() dto: { name?: string; parentId?: string },
  ) {
    return this.foldersService.update(id, dto);
  }

  @Delete('folders/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a folder (and all contents)' })
  async deleteFolder(@Param('id') id: string) {
    return this.foldersService.delete(id);
  }

  @Get('folders/:id/files')
  @ApiOperation({ summary: 'Get files in a folder' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getFilesInFolder(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.foldersService.getFilesInFolder(
      id,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Get('folders/:id/breadcrumb')
  @ApiOperation({ summary: 'Get folder breadcrumb path' })
  async getFolderBreadcrumb(@Param('id') id: string) {
    return this.foldersService.getFolderBreadcrumb(id);
  }

  @Post('buckets/:bucketId/files/:fileId/folders')
  @ApiOperation({ summary: 'Add file to a folder' })
  async addFileToFolder(
    @Param('fileId') fileId: string,
    @Body('folderId') folderId: string,
  ) {
    return this.foldersService.addFileToFolder(fileId, folderId);
  }

  @Delete('buckets/:bucketId/files/:fileId/folders/:folderId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove file from a folder' })
  async removeFileFromFolder(
    @Param('fileId') fileId: string,
    @Param('folderId') folderId: string,
  ) {
    return this.foldersService.removeFileFromFolder(fileId, folderId);
  }
}
