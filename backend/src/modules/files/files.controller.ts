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
} from '@nestjs/swagger';
import { FilesService } from './files.service';
import { PresignedUploadDto } from './dto/presigned-upload.dto';
import { ConfirmUploadDto } from './dto/confirm-upload.dto';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { CurrentApp } from '../../common/decorators/current-app.decorator';

@ApiTags('files')
@Controller('buckets/:bucketId/files')
@UseGuards(ApiKeyGuard)
@ApiSecurity('api-key')
export class FilesController {
  constructor(private filesService: FilesService) {}

  @Get()
  @ApiOperation({ summary: 'List files in bucket' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'prefix', required: false, type: String })
  @ApiQuery({ name: 'mimeType', required: false, type: String })
  @ApiQuery({ name: 'sort', required: false, type: String })
  @ApiQuery({ name: 'order', required: false, enum: ['asc', 'desc'] })
  async listFiles(
    @CurrentApp() app: { id: string },
    @Param('bucketId') bucketId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('prefix') prefix?: string,
    @Query('mimeType') mimeType?: string,
    @Query('sort') sort?: string,
    @Query('order') order?: 'asc' | 'desc',
  ) {
    return this.filesService.listFiles(app.id, bucketId, {
      page,
      limit,
      prefix,
      mimeType,
      sort,
      order,
    });
  }

  @Post('presigned-upload')
  @ApiOperation({ summary: 'Get presigned URL for direct upload' })
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
  async getFileDetails(
    @CurrentApp() app: { id: string },
    @Param('bucketId') bucketId: string,
    @Param('fileId') fileId: string,
  ) {
    return this.filesService.getFileDetails(app.id, bucketId, fileId);
  }

  @Get(':fileId/download')
  @ApiOperation({ summary: 'Get download URL' })
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
  @ApiOperation({ summary: 'Delete file' })
  async deleteFile(
    @CurrentApp() app: { id: string },
    @Param('bucketId') bucketId: string,
    @Param('fileId') fileId: string,
  ) {
    return this.filesService.deleteFile(app.id, bucketId, fileId);
  }

  @Post('bulk-delete')
  @ApiOperation({ summary: 'Delete multiple files' })
  async bulkDelete(
    @CurrentApp() app: { id: string },
    @Param('bucketId') bucketId: string,
    @Body('fileIds') fileIds: string[],
  ) {
    return this.filesService.bulkDelete(app.id, bucketId, fileIds);
  }
}
