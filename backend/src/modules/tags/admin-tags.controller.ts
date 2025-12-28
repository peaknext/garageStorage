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
import { TagsService, CreateTagDto } from './tags.service';

@ApiTags('admin-tags')
@Controller('admin')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminTagsController {
  constructor(private tagsService: TagsService) {}

  @Get('applications/:appId/tags')
  @ApiOperation({ summary: 'List tags for an application' })
  async listTags(@Param('appId') appId: string) {
    return this.tagsService.findAllByApplication(appId);
  }

  @Post('applications/:appId/tags')
  @ApiOperation({ summary: 'Create a tag' })
  async createTag(@Param('appId') appId: string, @Body() dto: CreateTagDto) {
    return this.tagsService.create(appId, dto);
  }

  @Patch('tags/:id')
  @ApiOperation({ summary: 'Update a tag' })
  async updateTag(@Param('id') id: string, @Body() dto: Partial<CreateTagDto>) {
    return this.tagsService.update(id, dto);
  }

  @Delete('tags/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a tag' })
  async deleteTag(@Param('id') id: string) {
    return this.tagsService.delete(id);
  }

  @Get('tags/:id/files')
  @ApiOperation({ summary: 'Get files with a specific tag' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getFilesByTag(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.tagsService.getFilesByTag(
      id,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Post('buckets/:bucketId/files/:fileId/tags')
  @ApiOperation({ summary: 'Add tags to a file' })
  async addTagsToFile(
    @Param('fileId') fileId: string,
    @Body('tagIds') tagIds: string[],
  ) {
    return this.tagsService.addTagsToFile(fileId, tagIds);
  }

  @Delete('buckets/:bucketId/files/:fileId/tags/:tagId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a tag from a file' })
  async removeTagFromFile(
    @Param('fileId') fileId: string,
    @Param('tagId') tagId: string,
  ) {
    return this.tagsService.removeTagFromFile(fileId, tagId);
  }

  @Get('buckets/:bucketId/files/:fileId/tags')
  @ApiOperation({ summary: 'Get tags for a file' })
  async getFileTags(@Param('fileId') fileId: string) {
    return this.tagsService.getFileTags(fileId);
  }
}
