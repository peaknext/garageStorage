import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { ActorType, AuditStatus, Prisma } from '@prisma/client';

export interface AuditEventPayload {
  actorType: ActorType;
  actorId?: string;
  actorEmail?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  resourceName?: string;
  ipAddress?: string;
  userAgent?: string;
  requestMethod?: string;
  requestPath?: string;
  previousValue?: any;
  newValue?: any;
  status?: AuditStatus;
  errorMessage?: string;
  metadata?: any;
  adminUserId?: string;
}

export interface QueryAuditLogsDto {
  page?: number;
  limit?: number;
  actorType?: ActorType;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Handle audit events asynchronously
   */
  @OnEvent('audit.log')
  async handleAuditEvent(payload: AuditEventPayload) {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorType: payload.actorType,
          actorId: payload.actorId,
          actorEmail: payload.actorEmail,
          action: payload.action,
          resourceType: payload.resourceType,
          resourceId: payload.resourceId,
          resourceName: payload.resourceName,
          ipAddress: payload.ipAddress,
          userAgent: payload.userAgent,
          requestMethod: payload.requestMethod,
          requestPath: payload.requestPath,
          previousValue: payload.previousValue,
          newValue: payload.newValue,
          status: payload.status || AuditStatus.SUCCESS,
          errorMessage: payload.errorMessage,
          metadata: payload.metadata,
          adminUserId: payload.adminUserId,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to create audit log: ${error.message}`, error.stack);
    }
  }

  /**
   * Create an audit log entry directly
   */
  async log(payload: AuditEventPayload) {
    return this.handleAuditEvent(payload);
  }

  /**
   * Query audit logs with pagination and filters
   */
  async findAll(query: QueryAuditLogsDto) {
    const { page = 1, limit = 50, actorType, action, resourceType, resourceId, startDate, endDate, search } = query;

    const where: Prisma.AuditLogWhereInput = {};

    if (actorType) {
      where.actorType = actorType;
    }

    if (action) {
      where.action = action;
    }

    if (resourceType) {
      where.resourceType = resourceType;
    }

    if (resourceId) {
      where.resourceId = resourceId;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate);
      }
    }

    if (search) {
      where.OR = [
        { actorEmail: { contains: search, mode: 'insensitive' } },
        { resourceName: { contains: search, mode: 'insensitive' } },
        { action: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          adminUser: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: logs,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get audit statistics
   */
  async getStats() {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [totalLogs, last24hCount, last7dCount, actionCounts, resourceTypeCounts] = await Promise.all([
      this.prisma.auditLog.count(),
      this.prisma.auditLog.count({ where: { createdAt: { gte: last24h } } }),
      this.prisma.auditLog.count({ where: { createdAt: { gte: last7d } } }),
      this.prisma.auditLog.groupBy({
        by: ['action'],
        _count: true,
        orderBy: { _count: { action: 'desc' } },
        take: 10,
      }),
      this.prisma.auditLog.groupBy({
        by: ['resourceType'],
        _count: true,
        orderBy: { _count: { resourceType: 'desc' } },
        take: 10,
      }),
    ]);

    return {
      totalLogs,
      last24hCount,
      last7dCount,
      topActions: actionCounts.map((a) => ({ action: a.action, count: a._count })),
      topResourceTypes: resourceTypeCounts.map((r) => ({ resourceType: r.resourceType, count: r._count })),
    };
  }

  /**
   * Get a single audit log by ID
   */
  async findOne(id: string) {
    return this.prisma.auditLog.findUnique({
      where: { id },
      include: {
        adminUser: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }

  /**
   * Delete old audit logs based on retention policy
   */
  async cleanupOldLogs(retentionDays: number) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await this.prisma.auditLog.deleteMany({
      where: { createdAt: { lt: cutoffDate } },
    });

    this.logger.log(`Cleaned up ${result.count} audit logs older than ${retentionDays} days`);
    return result.count;
  }
}
