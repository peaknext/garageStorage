import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { FilesService } from './files.service';
import { PresignedUploadDto } from './dto/presigned-upload.dto';
import { ConfirmUploadDto } from './dto/confirm-upload.dto';

@ApiTags('admin-files')
@Controller('admin/buckets/:bucketId/files')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminFilesController {
  constructor(
    private prisma: PrismaService,
    private filesService: FilesService,
  ) {}

  private async getBucketWithApp(bucketId: string) {
    const bucket = await this.prisma.bucket.findUnique({
      where: { id: bucketId },
      include: { application: true },
    });

    if (!bucket) {
      throw new NotFoundException('Bucket not found');
    }

    return bucket;
  }

  @Get()
  @ApiOperation({ summary: 'List files in bucket (Admin)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'mimeType', required: false, type: String })
  @ApiQuery({ name: 'dateFrom', required: false, type: String, description: 'ISO date string' })
  @ApiQuery({ name: 'dateTo', required: false, type: String, description: 'ISO date string' })
  @ApiQuery({ name: 'sizeMin', required: false, type: Number, description: 'Min file size in bytes' })
  @ApiQuery({ name: 'sizeMax', required: false, type: Number, description: 'Max file size in bytes' })
  @ApiQuery({ name: 'sort', required: false, type: String })
  @ApiQuery({ name: 'order', required: false, enum: ['asc', 'desc'] })
  async listFiles(
    @Param('bucketId') bucketId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('mimeType') mimeType?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('sizeMin') sizeMin?: string,
    @Query('sizeMax') sizeMax?: string,
    @Query('sort') sort?: string,
    @Query('order') order?: 'asc' | 'desc',
  ) {
    const bucket = await this.getBucketWithApp(bucketId);

    return this.filesService.listFiles(bucket.applicationId, bucketId, {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
      prefix: search,
      mimeType,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
      sizeMin: sizeMin ? parseInt(sizeMin, 10) : undefined,
      sizeMax: sizeMax ? parseInt(sizeMax, 10) : undefined,
      sort: sort || 'createdAt',
      order: order || 'desc',
    });
  }

  @Post('presigned-upload')
  @ApiOperation({ summary: 'Get presigned URL for direct upload (Admin)' })
  async getPresignedUploadUrl(
    @Param('bucketId') bucketId: string,
    @Body() dto: PresignedUploadDto,
  ) {
    const bucket = await this.getBucketWithApp(bucketId);
    return this.filesService.getPresignedUploadUrl(
      bucket.applicationId,
      bucketId,
      dto,
    );
  }

  @Post('confirm-upload')
  @ApiOperation({ summary: 'Confirm file upload and save metadata (Admin)' })
  async confirmUpload(
    @Param('bucketId') bucketId: string,
    @Body() dto: ConfirmUploadDto,
  ) {
    const bucket = await this.getBucketWithApp(bucketId);
    return this.filesService.confirmUpload(bucket.applicationId, bucketId, dto);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Direct upload for small files < 10MB (Admin)' })
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
    @Param('bucketId') bucketId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('key') key?: string,
    @Body('metadata') metadataStr?: string,
    @Body('isPublic') isPublic?: string,
  ) {
    const bucket = await this.getBucketWithApp(bucketId);
    const metadata = metadataStr ? JSON.parse(metadataStr) : undefined;
    return this.filesService.uploadFile(bucket.applicationId, bucketId, file, {
      key,
      metadata,
      isPublic: isPublic === 'true',
    });
  }

  @Get(':fileId')
  @ApiOperation({ summary: 'Get file details (Admin)' })
  async getFileDetails(
    @Param('bucketId') bucketId: string,
    @Param('fileId') fileId: string,
  ) {
    const bucket = await this.getBucketWithApp(bucketId);
    return this.filesService.getFileDetails(
      bucket.applicationId,
      bucketId,
      fileId,
    );
  }

  @Get(':fileId/download')
  @ApiOperation({ summary: 'Get download URL (Admin)' })
  @ApiQuery({ name: 'expiresIn', required: false, type: Number })
  async getDownloadUrl(
    @Param('bucketId') bucketId: string,
    @Param('fileId') fileId: string,
    @Query('expiresIn') expiresIn?: string,
  ) {
    const bucket = await this.getBucketWithApp(bucketId);
    return this.filesService.getDownloadUrl(
      bucket.applicationId,
      bucketId,
      fileId,
      expiresIn ? parseInt(expiresIn, 10) : 3600,
    );
  }

  @Patch(':fileId')
  @ApiOperation({ summary: 'Update file metadata (rename, etc.)' })
  async updateFile(
    @Param('bucketId') bucketId: string,
    @Param('fileId') fileId: string,
    @Body() dto: { originalName?: string; metadata?: Record<string, string>; isPublic?: boolean },
  ) {
    const bucket = await this.getBucketWithApp(bucketId);
    return this.filesService.updateFile(
      bucket.applicationId,
      bucketId,
      fileId,
      dto,
    );
  }

  @Delete(':fileId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete file (soft delete by default, use ?permanent=true for hard delete)' })
  @ApiQuery({ name: 'permanent', required: false, type: Boolean, description: 'Permanently delete without moving to recycle bin' })
  async deleteFile(
    @Param('bucketId') bucketId: string,
    @Param('fileId') fileId: string,
    @Query('permanent') permanent?: string,
  ) {
    const bucket = await this.getBucketWithApp(bucketId);
    return this.filesService.deleteFile(bucket.applicationId, bucketId, fileId, {
      permanent: permanent === 'true',
      deletedBy: 'admin',
    });
  }

  @Post('bulk-delete')
  @ApiOperation({ summary: 'Delete multiple files (soft delete by default)' })
  async bulkDelete(
    @Param('bucketId') bucketId: string,
    @Body() dto: { fileIds: string[]; permanent?: boolean },
  ) {
    const bucket = await this.getBucketWithApp(bucketId);
    return this.filesService.bulkDelete(bucket.applicationId, bucketId, dto.fileIds, {
      permanent: dto.permanent || false,
      deletedBy: 'admin',
    });
  }

  @Post('sync')
  @ApiOperation({ summary: 'Sync files from Garage S3 to database (Admin)' })
  async syncFilesFromGarage(@Param('bucketId') bucketId: string) {
    return this.filesService.syncFilesFromGarage(bucketId);
  }

  @Post('scan-duplicates')
  @ApiOperation({ summary: 'Scan for duplicate files by checksum (Admin)' })
  async scanDuplicates(@Param('bucketId') bucketId: string) {
    const bucket = await this.getBucketWithApp(bucketId);
    return this.filesService.scanDuplicates(bucket.applicationId, bucketId);
  }

  @Post('download-zip')
  @ApiOperation({ summary: 'Download multiple files as ZIP archive (Admin)' })
  async downloadZip(
    @Param('bucketId') bucketId: string,
    @Body() dto: { fileIds: string[] },
    @Res() res: Response,
  ) {
    const bucket = await this.getBucketWithApp(bucketId);
    await this.filesService.streamZipDownload(
      bucket.applicationId,
      bucketId,
      dto.fileIds,
      res,
    );
  }

  @Get(':fileId/versions')
  @ApiOperation({ summary: 'List file versions (Admin)' })
  async listVersions(
    @Param('bucketId') bucketId: string,
    @Param('fileId') fileId: string,
  ) {
    const bucket = await this.getBucketWithApp(bucketId);
    return this.filesService.listVersions(bucket.applicationId, bucketId, fileId);
  }

  @Post(':fileId/versions/:versionId/restore')
  @ApiOperation({ summary: 'Restore a file version (Admin)' })
  async restoreVersion(
    @Param('bucketId') bucketId: string,
    @Param('fileId') fileId: string,
    @Param('versionId') versionId: string,
  ) {
    const bucket = await this.getBucketWithApp(bucketId);
    return this.filesService.restoreVersion(
      bucket.applicationId,
      bucketId,
      fileId,
      versionId,
    );
  }

  @Delete(':fileId/versions/:versionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a file version (Admin)' })
  async deleteVersion(
    @Param('bucketId') bucketId: string,
    @Param('fileId') fileId: string,
    @Param('versionId') versionId: string,
  ) {
    const bucket = await this.getBucketWithApp(bucketId);
    await this.filesService.deleteVersion(
      bucket.applicationId,
      bucketId,
      fileId,
      versionId,
    );
  }
}
