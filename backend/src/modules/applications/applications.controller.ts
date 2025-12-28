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
import { ApplicationsService } from './applications.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('applications')
@Controller('applications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ApplicationsController {
  constructor(private applicationsService: ApplicationsService) {}

  @Get()
  @ApiOperation({ summary: 'List all applications' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'search', required: false, type: String })
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.applicationsService.findAll({ page, limit, status, search });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get application details' })
  async findOne(@Param('id') id: string) {
    return this.applicationsService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create new application' })
  async create(@Body() dto: CreateApplicationDto) {
    return this.applicationsService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update application' })
  async update(@Param('id') id: string, @Body() dto: UpdateApplicationDto) {
    return this.applicationsService.update(id, dto);
  }

  @Post(':id/regenerate-key')
  @ApiOperation({ summary: 'Regenerate API key' })
  async regenerateKey(@Param('id') id: string) {
    return this.applicationsService.regenerateApiKey(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete application' })
  async delete(@Param('id') id: string) {
    return this.applicationsService.delete(id);
  }
}
