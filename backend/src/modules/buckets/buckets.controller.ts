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
} from '@nestjs/swagger';
import { BucketsService } from './buckets.service';
import { CreateBucketDto } from './dto/create-bucket.dto';
import { UpdateBucketDto } from './dto/update-bucket.dto';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { CurrentApp } from '../../common/decorators/current-app.decorator';

@ApiTags('buckets')
@Controller('buckets')
@UseGuards(ApiKeyGuard)
@ApiSecurity('api-key')
export class BucketsController {
  constructor(private bucketsService: BucketsService) {}

  @Get()
  @ApiOperation({ summary: 'List buckets for current application' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAll(
    @CurrentApp() app: { id: string },
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.bucketsService.findAll(app.id, { page, limit });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get bucket details' })
  async findOne(@CurrentApp() app: { id: string }, @Param('id') id: string) {
    return this.bucketsService.findOne(app.id, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create new bucket' })
  async create(
    @CurrentApp() app: { id: string },
    @Body() dto: CreateBucketDto,
  ) {
    return this.bucketsService.create(app.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update bucket settings' })
  async update(
    @CurrentApp() app: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateBucketDto,
  ) {
    return this.bucketsService.update(app.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete bucket' })
  @ApiQuery({ name: 'force', required: false, type: Boolean })
  async delete(
    @CurrentApp() app: { id: string },
    @Param('id') id: string,
    @Query('force') force?: boolean,
  ) {
    return this.bucketsService.delete(app.id, id, force);
  }
}
