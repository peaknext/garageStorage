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
import { TagsService, CreateTagDto } from './tags.service';

class BulkTagDto {
  fileIds: string[];
  tagIds: string[];
}

@ApiTags('tags')
@Controller('tags')
@UseGuards(ApiKeyGuard)
@ApiSecurity('api-key')
export class TagsController {
  constructor(private tagsService: TagsService) {}

  @Get()
  @ApiOperation({ summary: 'List tags for current application' })
  async listTags(@CurrentApp() app: { id: string }) {
    const tags = await this.tagsService.findAllByApplication(app.id);
    return { data: tags };
  }

  @Post()
  @ApiOperation({ summary: 'Create a tag' })
  async createTag(
    @CurrentApp() app: { id: string },
    @Body() dto: CreateTagDto,
  ) {
    return this.tagsService.create(app.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a tag' })
  async updateTag(
    @CurrentApp() app: { id: string },
    @Param('id') id: string,
    @Body() dto: Partial<CreateTagDto>,
  ) {
    return this.tagsService.updateWithAppValidation(app.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a tag' })
  async deleteTag(
    @CurrentApp() app: { id: string },
    @Param('id') id: string,
  ) {
    return this.tagsService.deleteWithAppValidation(app.id, id);
  }

  @Get(':id/files')
  @ApiOperation({ summary: 'Get files with a specific tag' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getFilesByTag(
    @CurrentApp() app: { id: string },
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.tagsService.getFilesByTagWithAppValidation(
      app.id,
      id,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Post('bulk')
  @ApiOperation({ summary: 'Bulk add tags to multiple files' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        fileIds: { type: 'array', items: { type: 'string' } },
        tagIds: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  async bulkAddTagsToFiles(
    @CurrentApp() app: { id: string },
    @Body() dto: BulkTagDto,
  ) {
    return this.tagsService.bulkAddTagsToFiles(app.id, dto.fileIds, dto.tagIds);
  }
}

// File tags controller (nested under buckets)
@ApiTags('files')
@Controller('buckets/:bucketId/files/:fileId/tags')
@UseGuards(ApiKeyGuard)
@ApiSecurity('api-key')
export class FileTagsController {
  constructor(private tagsService: TagsService) {}

  @Get()
  @ApiOperation({ summary: 'Get tags for a file' })
  async getFileTags(
    @CurrentApp() app: { id: string },
    @Param('fileId') fileId: string,
  ) {
    return this.tagsService.getFileTagsWithAppValidation(app.id, fileId);
  }

  @Post()
  @ApiOperation({ summary: 'Add tags to a file' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        tagIds: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  async addTagsToFile(
    @CurrentApp() app: { id: string },
    @Param('fileId') fileId: string,
    @Body('tagIds') tagIds: string[],
  ) {
    return this.tagsService.addTagsToFileWithAppValidation(app.id, fileId, tagIds);
  }

  @Delete(':tagId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a tag from a file' })
  async removeTagFromFile(
    @CurrentApp() app: { id: string },
    @Param('fileId') fileId: string,
    @Param('tagId') tagId: string,
  ) {
    return this.tagsService.removeTagFromFileWithAppValidation(app.id, fileId, tagId);
  }
}
