import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from './notification.service';
import { AlertLevel } from '@prisma/client';

export interface CreateAlertDto {
  applicationId: string;
  warningThreshold?: number;
  criticalThreshold?: number;
  notifyEmail?: string[];
  notifyWebhook?: boolean;
  cooldownMinutes?: number;
  isActive?: boolean;
}

export interface UpdateAlertDto {
  warningThreshold?: number;
  criticalThreshold?: number;
  notifyEmail?: string[];
  notifyWebhook?: boolean;
  cooldownMinutes?: number;
  isActive?: boolean;
}

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async checkQuotas() {
    this.logger.log('Checking application quotas...');

    const alerts = await this.prisma.quotaAlert.findMany({
      where: { isActive: true },
      include: { application: true },
    });

    for (const alert of alerts) {
      await this.checkApplicationQuota(alert);
    }
  }

  private async checkApplicationQuota(alert: any) {
    const app = alert.application;
    const usedBytes = Number(app.usedStorageBytes);
    const maxBytes = Number(app.maxStorageBytes);
    const usedPercentage = (usedBytes / maxBytes) * 100;

    this.logger.debug(
      `App ${app.name}: ${usedPercentage.toFixed(1)}% used (${usedBytes}/${maxBytes})`,
    );

    if (usedPercentage >= alert.criticalThreshold) {
      await this.handleCriticalAlert(alert, usedPercentage);
    } else if (usedPercentage >= alert.warningThreshold) {
      await this.handleWarningAlert(alert, usedPercentage);
    } else if (alert.currentLevel !== AlertLevel.NORMAL) {
      // Reset to normal
      await this.prisma.quotaAlert.update({
        where: { id: alert.id },
        data: { currentLevel: AlertLevel.NORMAL },
      });
    }
  }

  private async handleWarningAlert(alert: any, usage: number) {
    // Check cooldown
    if (alert.lastWarningAt) {
      const cooldownEnd = new Date(alert.lastWarningAt);
      cooldownEnd.setMinutes(cooldownEnd.getMinutes() + alert.cooldownMinutes);
      if (new Date() < cooldownEnd) return;
    }

    // Send notification
    await this.notificationService.sendQuotaAlert({
      level: AlertLevel.WARNING,
      applicationId: alert.applicationId,
      applicationName: alert.application.name,
      usage,
      threshold: alert.warningThreshold,
      emails: alert.notifyEmail,
      sendWebhook: alert.notifyWebhook,
    });

    // Update alert record
    await this.prisma.quotaAlert.update({
      where: { id: alert.id },
      data: {
        lastWarningAt: new Date(),
        currentLevel: AlertLevel.WARNING,
      },
    });

    this.logger.warn(
      `Warning alert sent for ${alert.application.name}: ${usage.toFixed(1)}% usage`,
    );
  }

  private async handleCriticalAlert(alert: any, usage: number) {
    // Check cooldown
    if (alert.lastCriticalAt) {
      const cooldownEnd = new Date(alert.lastCriticalAt);
      cooldownEnd.setMinutes(cooldownEnd.getMinutes() + alert.cooldownMinutes);
      if (new Date() < cooldownEnd) return;
    }

    // Send notification
    await this.notificationService.sendQuotaAlert({
      level: AlertLevel.CRITICAL,
      applicationId: alert.applicationId,
      applicationName: alert.application.name,
      usage,
      threshold: alert.criticalThreshold,
      emails: alert.notifyEmail,
      sendWebhook: alert.notifyWebhook,
    });

    // Update alert record
    await this.prisma.quotaAlert.update({
      where: { id: alert.id },
      data: {
        lastCriticalAt: new Date(),
        currentLevel: AlertLevel.CRITICAL,
      },
    });

    this.logger.error(
      `Critical alert sent for ${alert.application.name}: ${usage.toFixed(1)}% usage`,
    );
  }

  async findAll() {
    return this.prisma.quotaAlert.findMany({
      include: {
        application: {
          select: {
            id: true,
            name: true,
            usedStorageBytes: true,
            maxStorageBytes: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByApplication(applicationId: string) {
    const alert = await this.prisma.quotaAlert.findUnique({
      where: { applicationId },
      include: {
        application: {
          select: {
            id: true,
            name: true,
            usedStorageBytes: true,
            maxStorageBytes: true,
          },
        },
      },
    });

    return alert;
  }

  async createOrUpdate(dto: CreateAlertDto) {
    const existing = await this.prisma.quotaAlert.findUnique({
      where: { applicationId: dto.applicationId },
    });

    if (existing) {
      return this.prisma.quotaAlert.update({
        where: { id: existing.id },
        data: {
          warningThreshold: dto.warningThreshold,
          criticalThreshold: dto.criticalThreshold,
          notifyEmail: dto.notifyEmail,
          notifyWebhook: dto.notifyWebhook,
          cooldownMinutes: dto.cooldownMinutes,
          isActive: dto.isActive,
        },
        include: { application: { select: { id: true, name: true } } },
      });
    }

    return this.prisma.quotaAlert.create({
      data: {
        applicationId: dto.applicationId,
        warningThreshold: dto.warningThreshold ?? 75,
        criticalThreshold: dto.criticalThreshold ?? 90,
        notifyEmail: dto.notifyEmail ?? [],
        notifyWebhook: dto.notifyWebhook ?? true,
        cooldownMinutes: dto.cooldownMinutes ?? 60,
        isActive: dto.isActive ?? true,
      },
      include: { application: { select: { id: true, name: true } } },
    });
  }

  async delete(applicationId: string) {
    const alert = await this.prisma.quotaAlert.findUnique({
      where: { applicationId },
    });

    if (!alert) {
      throw new NotFoundException('Alert not found');
    }

    await this.prisma.quotaAlert.delete({ where: { id: alert.id } });
  }

  async testAlert(applicationId: string) {
    const alert = await this.findByApplication(applicationId);
    if (!alert) {
      throw new NotFoundException('Alert not configured for this application');
    }

    await this.notificationService.sendQuotaAlert({
      level: AlertLevel.WARNING,
      applicationId,
      applicationName: alert.application.name,
      usage: 80,
      threshold: 75,
      emails: alert.notifyEmail,
      sendWebhook: alert.notifyWebhook,
      isTest: true,
    });

    return { message: 'Test notification sent' };
  }
}
