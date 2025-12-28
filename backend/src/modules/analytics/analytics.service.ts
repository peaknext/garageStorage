import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getOverview(appId?: string) {
    const where = appId ? { applicationId: appId } : {};
    const appWhere = appId ? { id: appId } : {};

    const [
      apps,
      buckets,
      files,
      totalStorage,
      todayUploads,
      monthUploads,
      todayDownloads,
      monthDownloads,
    ] = await Promise.all([
      this.prisma.application.count({ where: { ...appWhere, status: 'ACTIVE' } }),
      this.prisma.bucket.count({ where }),
      this.prisma.file.count({ where: { bucket: where } }),
      this.prisma.application.aggregate({
        where: appWhere,
        _sum: {
          usedStorageBytes: true,
          maxStorageBytes: true,
        },
      }),
      this.prisma.file.count({
        where: {
          bucket: where,
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      }),
      this.prisma.file.count({
        where: {
          bucket: where,
          createdAt: {
            gte: new Date(new Date().setDate(1)),
          },
        },
      }),
      this.prisma.accessLog.count({
        where: {
          ...where,
          action: 'DOWNLOAD',
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      }),
      this.prisma.accessLog.count({
        where: {
          ...where,
          action: 'DOWNLOAD',
          createdAt: {
            gte: new Date(new Date().setDate(1)),
          },
        },
      }),
    ]);

    const usedBytes = Number(totalStorage._sum.usedStorageBytes || 0);
    const quotaBytes = Number(totalStorage._sum.maxStorageBytes || 0);

    // Top buckets
    const topBuckets = await this.prisma.bucket.findMany({
      where,
      orderBy: { usedBytes: 'desc' },
      take: 5,
      include: {
        _count: { select: { files: true } },
      },
    });

    return {
      totalStorage: {
        usedBytes,
        quotaBytes,
        percentage: quotaBytes > 0 ? (usedBytes / quotaBytes) * 100 : 0,
      },
      files: {
        total: files,
        uploadedToday: todayUploads,
        uploadedThisMonth: monthUploads,
      },
      downloads: {
        today: todayDownloads,
        thisMonth: monthDownloads,
      },
      applications: apps,
      buckets,
      topBuckets: topBuckets.map((b) => ({
        name: b.name,
        usedBytes: Number(b.usedBytes),
        fileCount: b._count.files,
      })),
    };
  }

  async getUsageOverTime(
    appId: string | undefined,
    from: Date,
    to: Date,
    interval: 'hour' | 'day' | 'week' | 'month' = 'day',
  ) {
    const where: any = {
      createdAt: {
        gte: from,
        lte: to,
      },
    };

    if (appId) {
      where.applicationId = appId;
    }

    // Get access logs grouped by date
    const logs = await this.prisma.accessLog.findMany({
      where,
      select: {
        action: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group by interval
    const grouped = new Map<string, { uploads: number; downloads: number }>();

    for (const log of logs) {
      const key = this.getIntervalKey(log.createdAt, interval);
      const existing = grouped.get(key) || { uploads: 0, downloads: 0 };

      if (log.action === 'UPLOAD') {
        existing.uploads++;
      } else if (log.action === 'DOWNLOAD') {
        existing.downloads++;
      }

      grouped.set(key, existing);
    }

    return Array.from(grouped.entries()).map(([timestamp, data]) => ({
      timestamp,
      uploadsCount: data.uploads,
      downloadsCount: data.downloads,
    }));
  }

  async getTopFiles(
    appId: string | undefined,
    limit: number = 10,
    period?: 'day' | 'week' | 'month' | 'all',
  ) {
    const where: any = {};

    if (appId) {
      where.bucket = { applicationId: appId };
    }

    if (period && period !== 'all') {
      const now = new Date();
      let startDate: Date;

      switch (period) {
        case 'day':
          startDate = new Date(now.setHours(0, 0, 0, 0));
          break;
        case 'week':
          startDate = new Date(now.setDate(now.getDate() - 7));
          break;
        case 'month':
          startDate = new Date(now.setMonth(now.getMonth() - 1));
          break;
        default:
          startDate = new Date(0);
      }

      where.lastAccessedAt = { gte: startDate };
    }

    const files = await this.prisma.file.findMany({
      where,
      orderBy: { downloadCount: 'desc' },
      take: limit,
      select: {
        id: true,
        originalName: true,
        downloadCount: true,
        sizeBytes: true,
        mimeType: true,
      },
    });

    return files.map((f) => ({
      fileId: f.id,
      fileName: f.originalName,
      downloadCount: f.downloadCount,
      sizeBytes: Number(f.sizeBytes),
      mimeType: f.mimeType,
    }));
  }

  private getIntervalKey(
    date: Date,
    interval: 'hour' | 'day' | 'week' | 'month',
  ): string {
    switch (interval) {
      case 'hour':
        return date.toISOString().substring(0, 13) + ':00:00.000Z';
      case 'day':
        return date.toISOString().substring(0, 10);
      case 'week':
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        return weekStart.toISOString().substring(0, 10);
      case 'month':
        return date.toISOString().substring(0, 7);
      default:
        return date.toISOString().substring(0, 10);
    }
  }
}
