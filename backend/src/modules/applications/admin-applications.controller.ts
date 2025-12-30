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
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { AppStatus } from '../../generated/prisma';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';

@ApiTags('admin-applications')
@Controller('admin/applications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminApplicationsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'List all applications (Admin)' })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAll(
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = parseInt(page || '1', 10);
    const limitNum = parseInt(limit || '50', 10);
    const skip = (pageNum - 1) * limitNum;
    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { slug: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [applications, total] = await Promise.all([
      this.prisma.application.findMany({
        where,
        skip,
        take: limitNum,
        include: {
          _count: {
            select: { buckets: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.application.count({ where }),
    ]);

    return {
      data: applications.map((app) => ({
        id: app.id,
        name: app.name,
        slug: app.slug,
        description: app.description,
        status: app.status,
        maxStorageBytes: Number(app.maxStorageBytes),
        usedStorageBytes: Number(app.usedStorageBytes),
        bucketCount: app._count.buckets,
        createdAt: app.createdAt,
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get application details (Admin)' })
  async findOne(@Param('id') id: string) {
    const app = await this.prisma.application.findUnique({
      where: { id },
      include: {
        _count: {
          select: { buckets: true },
        },
      },
    });

    if (!app) {
      return null;
    }

    return {
      ...app,
      maxStorageBytes: Number(app.maxStorageBytes),
      usedStorageBytes: Number(app.usedStorageBytes),
      bucketCount: app._count.buckets,
    };
  }

  @Post()
  @ApiOperation({ summary: 'Create new application (Admin)' })
  async create(
    @Body() dto: { name: string; slug: string; description?: string },
  ) {
    // Generate API key
    const apiKey = `gsk_${crypto.randomBytes(32).toString('hex')}`;
    const apiKeyHash = await bcrypt.hash(apiKey, 10);

    const app = await this.prisma.application.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        description: dto.description,
        apiKeyHash,
      },
    });

    return {
      id: app.id,
      name: app.name,
      slug: app.slug,
      apiKey, // Only returned on creation
    };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update application (Admin)' })
  async update(
    @Param('id') id: string,
    @Body() dto: { name?: string; description?: string; status?: AppStatus },
  ) {
    const app = await this.prisma.application.update({
      where: { id },
      data: dto,
    });

    return {
      id: app.id,
      name: app.name,
      slug: app.slug,
      status: app.status,
    };
  }

  @Post(':id/regenerate-key')
  @ApiOperation({ summary: 'Regenerate API key (Admin)' })
  async regenerateKey(@Param('id') id: string) {
    const apiKey = `gsk_${crypto.randomBytes(32).toString('hex')}`;
    const apiKeyHash = await bcrypt.hash(apiKey, 10);

    await this.prisma.application.update({
      where: { id },
      data: { apiKeyHash },
    });

    return { apiKey };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete application (Admin)' })
  async delete(@Param('id') id: string) {
    await this.prisma.application.delete({ where: { id } });
  }
}
