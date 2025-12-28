import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('admin-analytics')
@Controller('admin/analytics')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminAnalyticsController {
  constructor(private prisma: PrismaService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Get admin dashboard overview' })
  async getOverview() {
    // Get total storage used across all applications
    const storageStats = await this.prisma.file.aggregate({
      _sum: { sizeBytes: true },
      _count: true,
    });

    // Get counts
    const [applicationCount, bucketCount, todayUploads, monthUploads] = await Promise.all([
      this.prisma.application.count({ where: { status: 'ACTIVE' } }),
      this.prisma.bucket.count(),
      this.prisma.file.count({
        where: {
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      }),
      this.prisma.file.count({
        where: {
          createdAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
      }),
    ]);

    // Get download counts from access logs
    const [todayDownloads, monthDownloads] = await Promise.all([
      this.prisma.accessLog.count({
        where: {
          action: 'DOWNLOAD',
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      }),
      this.prisma.accessLog.count({
        where: {
          action: 'DOWNLOAD',
          createdAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
      }),
    ]);

    // Get top buckets by storage with file count
    const topBuckets = await this.prisma.bucket.findMany({
      select: {
        name: true,
        usedBytes: true,
        _count: {
          select: { files: true },
        },
      },
      orderBy: { usedBytes: 'desc' },
      take: 5,
    });

    // Calculate quota (sum of all application max storage)
    const quotaStats = await this.prisma.application.aggregate({
      _sum: { maxStorageBytes: true },
    });

    const totalUsed = Number(storageStats._sum?.sizeBytes || 0);
    const totalQuota = Number(quotaStats._sum?.maxStorageBytes || 107374182400); // Default 100GB

    return {
      totalStorage: {
        usedBytes: totalUsed,
        quotaBytes: totalQuota,
        percentage: totalQuota > 0 ? (totalUsed / totalQuota) * 100 : 0,
      },
      files: {
        total: storageStats._count,
        uploadedToday: todayUploads,
        uploadedThisMonth: monthUploads,
      },
      downloads: {
        today: todayDownloads,
        thisMonth: monthDownloads,
      },
      applications: applicationCount,
      buckets: bucketCount,
      topBuckets: topBuckets.map((b) => ({
        name: b.name,
        usedBytes: Number(b.usedBytes),
        fileCount: b._count.files,
      })),
    };
  }
}
