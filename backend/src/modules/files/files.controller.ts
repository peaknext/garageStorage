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
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiSecurity,
  ApiQuery,
  ApiConsumes,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import { FilesService } from './files.service';
import { PresignedUploadDto } from './dto/presigned-upload.dto';
import { ConfirmUploadDto } from './dto/confirm-upload.dto';
import { CopyFileDto } from './dto/copy-file.dto';
import { MoveFileDto } from './dto/move-file.dto';
import { SearchFilesDto } from './dto/search-files.dto';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { CurrentApp } from '../../common/decorators/current-app.decorator';
import {
  FileResponseDto,
  UploadPresignedResponseDto,
  DownloadUrlResponseDto,
} from '../../common/dto/response.dto';

@ApiTags('files')
@Controller('buckets/:bucketId/files')
@UseGuards(ApiKeyGuard)
@ApiSecurity('api-key')
export class FilesController {
  constructor(private filesService: FilesService) {}

  @Get()
  @ApiOperation({ summary: 'List files in bucket' })
  @ApiResponse({ status: 200, description: 'Paginated list of files', type: [FileResponseDto] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'prefix', required: false, type: String })
  @ApiQuery({ name: 'mimeType', required: false, type: String })
  @ApiQuery({ name: 'sort', required: false, type: String })
  @ApiQuery({ name: 'order', required: false, enum: ['asc', 'desc'] })
  async listFiles(
    @CurrentApp() app: { id: string },
    @Param('bucketId') bucketId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('prefix') prefix?: string,
    @Query('mimeType') mimeType?: string,
    @Query('sort') sort?: string,
    @Query('order') order?: 'asc' | 'desc',
  ) {
    return this.filesService.listFiles(app.id, bucketId, {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
      prefix,
      mimeType,
      sort,
      order,
    });
  }

  @Post('presigned-upload')
  @ApiOperation({ summary: 'Get presigned URL for direct upload' })
  @ApiResponse({ status: 201, description: 'Presigned upload URL and metadata', type: UploadPresignedResponseDto })
  async getPresignedUploadUrl(
    @CurrentApp() app: { id: string },
    @Param('bucketId') bucketId: string,
    @Body() dto: PresignedUploadDto,
  ) {
    return this.filesService.getPresignedUploadUrl(app.id, bucketId, dto);
  }

  @Post('confirm-upload')
  @ApiOperation({ summary: 'Confirm file upload and save metadata' })
  async confirmUpload(
    @CurrentApp() app: { id: string },
    @Param('bucketId') bucketId: string,
    @Body() dto: ConfirmUploadDto,
  ) {
    return this.filesService.confirmUpload(app.id, bucketId, dto);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Direct upload for small files (< 10MB)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        key: { type: 'string' },
        metadata: { type: 'string' },
        isPublic: { type: 'boolean' },
      },
    },
  })
  async uploadFile(
    @CurrentApp() app: { id: string },
    @Param('bucketId') bucketId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('key') key?: string,
    @Body('metadata') metadataStr?: string,
    @Body('isPublic') isPublic?: boolean,
  ) {
    const metadata = metadataStr ? JSON.parse(metadataStr) : undefined;
    return this.filesService.uploadFile(app.id, bucketId, file, {
      key,
      metadata,
      isPublic,
    });
  }

  @Get(':fileId')
  @ApiOperation({ summary: 'Get file details' })
  @ApiResponse({ status: 200, description: 'File details', type: FileResponseDto })
  async getFileDetails(
    @CurrentApp() app: { id: string },
    @Param('bucketId') bucketId: string,
    @Param('fileId') fileId: string,
  ) {
    return this.filesService.getFileDetails(app.id, bucketId, fileId);
  }

  @Get(':fileId/download')
  @ApiOperation({ summary: 'Get download URL' })
  @ApiResponse({ status: 200, description: 'Presigned download URL', type: DownloadUrlResponseDto })
  @ApiQuery({ name: 'expiresIn', required: false, type: Number })
  async getDownloadUrl(
    @CurrentApp() app: { id: string },
    @Param('bucketId') bucketId: string,
    @Param('fileId') fileId: string,
    @Query('expiresIn') expiresIn?: number,
  ) {
    return this.filesService.getDownloadUrl(
      app.id,
      bucketId,
      fileId,
      expiresIn,
    );
  }

  @Patch(':fileId')
  @ApiOperation({ summary: 'Update file metadata' })
  async updateFile(
    @CurrentApp() app: { id: string },
    @Param('bucketId') bucketId: string,
    @Param('fileId') fileId: string,
    @Body() dto: { metadata?: Record<string, any>; isPublic?: boolean },
  ) {
    return this.filesService.updateFile(app.id, bucketId, fileId, dto);
  }

  @Delete(':fileId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete file (soft delete by default, use ?permanent=true for hard delete)' })
  @ApiQuery({ name: 'permanent', required: false, type: Boolean, description: 'Permanently delete without moving to recycle bin' })
  async deleteFile(
    @CurrentApp() app: { id: string },
    @Param('bucketId') bucketId: string,
    @Param('fileId') fileId: string,
    @Query('permanent') permanent?: string,
  ) {
    return this.filesService.deleteFile(app.id, bucketId, fileId, {
      permanent: permanent === 'true',
      deletedBy: 'api',
    });
  }

  @Post('bulk-delete')
  @ApiOperation({ summary: 'Delete multiple files (soft delete by default)' })
  async bulkDelete(
    @CurrentApp() app: { id: string },
    @Param('bucketId') bucketId: string,
    @Body() dto: { fileIds: string[]; permanent?: boolean },
  ) {
    return this.filesService.bulkDelete(app.id, bucketId, dto.fileIds, {
      permanent: dto.permanent || false,
      deletedBy: 'api',
    });
  }

  @Post(':fileId/copy')
  @ApiOperation({ summary: 'Copy file to another bucket' })
  async copyFile(
    @CurrentApp() app: { id: string },
    @Param('bucketId') bucketId: string,
    @Param('fileId') fileId: string,
    @Body() dto: CopyFileDto,
  ) {
    return this.filesService.copyFile(app.id, bucketId, fileId, dto);
  }

  @Post(':fileId/move')
  @ApiOperation({ summary: 'Move file to another bucket' })
  async moveFile(
    @CurrentApp() app: { id: string },
    @Param('bucketId') bucketId: string,
    @Param('fileId') fileId: string,
    @Body() dto: MoveFileDto,
  ) {
    return this.filesService.moveFile(app.id, bucketId, fileId, dto);
  }

  @Get(':fileId/thumbnail')
  @ApiOperation({ summary: 'Get thumbnail URL for an image file' })
  async getThumbnailUrl(
    @CurrentApp() app: { id: string },
    @Param('bucketId') bucketId: string,
    @Param('fileId') fileId: string,
  ) {
    return this.filesService.getThumbnailUrl(app.id, bucketId, fileId);
  }

  @Post(':fileId/thumbnail/regenerate')
  @ApiOperation({ summary: 'Regenerate thumbnail for an image file' })
  async regenerateThumbnail(
    @CurrentApp() app: { id: string },
    @Param('bucketId') bucketId: string,
    @Param('fileId') fileId: string,
  ) {
    return this.filesService.regenerateThumbnail(app.id, bucketId, fileId);
  }
}

// Search controller (separate route for cross-bucket search)
@ApiTags('files')
@Controller('files')
@UseGuards(ApiKeyGuard)
@ApiSecurity('api-key')
export class FilesSearchController {
  constructor(private filesService: FilesService) {}

  @Post('search')
  @ApiOperation({ summary: 'Advanced file search across all buckets' })
  async searchFiles(
    @CurrentApp() app: { id: string },
    @Body() dto: SearchFilesDto,
  ) {
    return this.filesService.searchFiles(app.id, dto);
  }
}
