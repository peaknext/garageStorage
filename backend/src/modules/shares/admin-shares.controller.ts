import {
  Controller,
  Get,
  Post,
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
import { SharesService } from './shares.service';
import { CreateShareDto } from './dto/create-share.dto';

@ApiTags('admin-shares')
@Controller('admin')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminSharesController {
  constructor(
    private prisma: PrismaService,
    private sharesService: SharesService,
  ) {}

  // Global shares list for admins
  @Get('shares')
  @ApiOperation({ summary: 'List all shares across all files (Admin)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'expired'] })
  async listAllShares(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: 'active' | 'expired',
  ) {
    const pageNum = parseInt(page || '1', 10);
    const limitNum = parseInt(limit || '50', 10);
    const skip = (pageNum - 1) * limitNum;

    const now = new Date();
    const where: any = {};

    if (status === 'active') {
      where.OR = [
        { expiresAt: null },
        { expiresAt: { gt: now } },
      ];
    } else if (status === 'expired') {
      where.expiresAt = { lt: now };
    }

    const [shares, total] = await Promise.all([
      this.prisma.fileShare.findMany({
        where,
        skip,
        take: limitNum,
        include: {
          file: {
            select: {
              id: true,
              originalName: true,
              mimeType: true,
              sizeBytes: true,
              bucket: {
                select: {
                  id: true,
                  name: true,
                  application: {
                    select: { id: true, name: true },
                  },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.fileShare.count({ where }),
    ]);

    const baseUrl = process.env.API_BASE_URL || 'http://localhost:4001';

    return {
      data: shares.map((share) => ({
        id: share.id,
        token: share.token,
        shareUrl: `${baseUrl}/api/v1/shares/${share.token}/download`,
        expiresAt: share.expiresAt,
        maxDownloads: share.maxDownloads,
        downloadCount: share.downloadCount,
        hasPassword: !!share.passwordHash,
        allowPreview: share.allowPreview,
        createdAt: share.createdAt,
        isExpired: share.expiresAt ? share.expiresAt < now : false,
        file: {
          id: share.file.id,
          name: share.file.originalName,
          mimeType: share.file.mimeType,
          sizeBytes: Number(share.file.sizeBytes),
          bucket: share.file.bucket.name,
          application: share.file.bucket.application.name,
        },
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  }

  // Per-file share endpoints
  @Get('files/:fileId/shares')
  @ApiOperation({ summary: 'List shares for a file (Admin)' })
  async listShares(@Param('fileId') fileId: string) {
    return this.sharesService.listShares(fileId);
  }

  @Post('files/:fileId/shares')
  @ApiOperation({ summary: 'Create shareable link (Admin)' })
  async createShare(
    @Param('fileId') fileId: string,
    @Body() dto: CreateShareDto,
  ) {
    return this.sharesService.createShare(fileId, dto);
  }

  @Delete('files/:fileId/shares/:shareId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke share link (Admin)' })
  async revokeShare(
    @Param('fileId') fileId: string,
    @Param('shareId') shareId: string,
  ) {
    return this.sharesService.revokeShare(fileId, shareId);
  }

  // Delete share by ID (without fileId for convenience)
  @Delete('shares/:shareId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete share by ID (Admin)' })
  async deleteShare(@Param('shareId') shareId: string) {
    await this.prisma.fileShare.delete({ where: { id: shareId } });
  }
}
