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
import { BucketsService } from './buckets.service';
import { AdminCreateBucketDto } from './dto/admin-create-bucket.dto';
import { UpdateBucketDto } from './dto/update-bucket.dto';

@ApiTags('admin-buckets')
@Controller('admin/buckets')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminBucketsController {
  constructor(
    private prisma: PrismaService,
    private bucketsService: BucketsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all buckets (Admin)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = parseInt(page || '1', 10);
    const limitNum = parseInt(limit || '50', 10);
    const skip = (pageNum - 1) * limitNum;

    const [buckets, total] = await Promise.all([
      this.prisma.bucket.findMany({
        skip,
        take: limitNum,
        include: {
          application: {
            select: { name: true, slug: true },
          },
          _count: {
            select: { files: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.bucket.count(),
    ]);

    return {
      data: buckets.map((b) => ({
        id: b.id,
        name: b.name,
        isPublic: b.isPublic,
        usedBytes: Number(b.usedBytes),
        quotaBytes: b.quotaBytes ? Number(b.quotaBytes) : null,
        fileCount: b._count.files,
        application: b.application,
        createdAt: b.createdAt,
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  }

  @Post()
  @ApiOperation({ summary: 'Create bucket (Admin)' })
  async create(@Body() dto: AdminCreateBucketDto) {
    // Use the BucketsService which handles S3 bucket creation
    const result = await this.bucketsService.create(dto.applicationId, {
      name: dto.name,
      isPublic: dto.isPublic,
      quotaBytes: dto.quotaBytes,
      corsEnabled: dto.corsEnabled,
    });

    // Fetch the created bucket with application info
    const bucket = await this.prisma.bucket.findUnique({
      where: { id: result.id },
      include: {
        application: {
          select: { name: true, slug: true },
        },
      },
    });

    return {
      id: bucket!.id,
      name: bucket!.name,
      isPublic: bucket!.isPublic,
      usedBytes: 0,
      quotaBytes: bucket!.quotaBytes ? Number(bucket!.quotaBytes) : null,
      fileCount: 0,
      application: bucket!.application,
      createdAt: bucket!.createdAt,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get bucket details (Admin)' })
  async findOne(@Param('id') id: string) {
    const bucket = await this.prisma.bucket.findUnique({
      where: { id },
      include: {
        application: {
          select: { name: true, slug: true },
        },
        _count: {
          select: { files: true },
        },
      },
    });

    if (!bucket) {
      return null;
    }

    return {
      ...bucket,
      usedBytes: Number(bucket.usedBytes),
      quotaBytes: bucket.quotaBytes ? Number(bucket.quotaBytes) : null,
      fileCount: bucket._count.files,
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete bucket (Admin)' })
  async delete(@Param('id') id: string) {
    await this.prisma.bucket.delete({ where: { id } });
  }

  @Post('sync')
  @ApiOperation({ summary: 'Sync buckets from Garage to database (Admin)' })
  async syncFromGarage(@Body() body: { applicationId: string }) {
    return this.bucketsService.syncFromGarage(body.applicationId);
  }
}
