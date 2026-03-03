import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationType } from '../../generated/prisma';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    type: NotificationType;
    title: string;
    message: string;
    resourceType?: string;
    resourceId?: string;
  }) {
    return this.prisma.notification.create({ data });
  }

  async list(query: { unreadOnly?: boolean; limit?: number; page?: number }) {
    const { unreadOnly = false, limit = 20, page = 1 } = query;

    const where = unreadOnly ? { readAt: null } : {};

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      data: notifications,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getUnreadCount() {
    const count = await this.prisma.notification.count({
      where: { readAt: null },
    });
    return { count };
  }

  async markAsRead(id: string) {
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  async markAllAsRead() {
    await this.prisma.notification.updateMany({
      where: { readAt: null },
      data: { readAt: new Date() },
    });
  }

  // Event listeners to create notifications automatically
  @OnEvent('quota.warning')
  async handleQuotaWarning(payload: any) {
    await this.create({
      type: 'QUOTA_WARNING',
      title: 'Storage Quota Warning',
      message: `Application ${payload.applicationId} has reached ${payload.percentage}% of its storage quota.`,
      resourceType: 'APPLICATION',
      resourceId: payload.applicationId,
    });
  }

  @OnEvent('quota.critical')
  async handleQuotaCritical(payload: any) {
    await this.create({
      type: 'QUOTA_CRITICAL',
      title: 'Storage Quota Critical',
      message: `Application ${payload.applicationId} has reached ${payload.percentage}% of its storage quota!`,
      resourceType: 'APPLICATION',
      resourceId: payload.applicationId,
    });
  }

  @OnEvent('policy.executed')
  async handlePolicyExecuted(payload: any) {
    await this.create({
      type: 'POLICY_EXECUTED',
      title: 'Policy Executed',
      message: `Policy "${payload.policyName}" completed. ${payload.filesAffected || 0} files affected.`,
      resourceType: 'POLICY',
      resourceId: payload.policyId,
    });
  }
}
