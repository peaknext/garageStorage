import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import * as crypto from 'crypto';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private prisma: PrismaService) {}

  async create(appId: string, dto: CreateWebhookDto) {
    const secret = crypto.randomBytes(32).toString('hex');

    const webhook = await this.prisma.webhook.create({
      data: {
        applicationId: appId,
        url: dto.url,
        events: dto.events,
        secret,
      },
    });

    return {
      id: webhook.id,
      url: webhook.url,
      events: webhook.events,
      secret,
      isActive: webhook.isActive,
      createdAt: webhook.createdAt,
    };
  }

  async findAll(appId: string) {
    const webhooks = await this.prisma.webhook.findMany({
      where: { applicationId: appId },
      orderBy: { createdAt: 'desc' },
    });

    return webhooks.map((webhook) => ({
      id: webhook.id,
      url: webhook.url,
      events: webhook.events,
      isActive: webhook.isActive,
      lastTriggeredAt: webhook.lastTriggeredAt,
      failureCount: webhook.failureCount,
      createdAt: webhook.createdAt,
    }));
  }

  async update(
    appId: string,
    webhookId: string,
    dto: { url?: string; events?: string[]; isActive?: boolean },
  ) {
    const webhook = await this.prisma.webhook.findFirst({
      where: { id: webhookId, applicationId: appId },
    });

    if (!webhook) {
      throw new NotFoundException('Webhook not found');
    }

    const updated = await this.prisma.webhook.update({
      where: { id: webhookId },
      data: dto,
    });

    return {
      id: updated.id,
      url: updated.url,
      events: updated.events,
      isActive: updated.isActive,
      updatedAt: updated.updatedAt,
    };
  }

  async delete(appId: string, webhookId: string) {
    const webhook = await this.prisma.webhook.findFirst({
      where: { id: webhookId, applicationId: appId },
    });

    if (!webhook) {
      throw new NotFoundException('Webhook not found');
    }

    await this.prisma.webhook.delete({ where: { id: webhookId } });
  }

  async trigger(appId: string, event: string, payload: any) {
    const webhooks = await this.prisma.webhook.findMany({
      where: {
        applicationId: appId,
        isActive: true,
        events: { has: event },
      },
    });

    for (const webhook of webhooks) {
      this.sendWebhook(webhook, event, payload);
    }
  }

  private async sendWebhook(
    webhook: { id: string; url: string; secret: string },
    event: string,
    payload: any,
  ) {
    const body = JSON.stringify({
      event,
      timestamp: new Date().toISOString(),
      data: payload,
    });

    const signature = crypto
      .createHmac('sha256', webhook.secret)
      .update(body)
      .digest('hex');

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': event,
        },
        body,
      });

      if (response.ok) {
        await this.prisma.webhook.update({
          where: { id: webhook.id },
          data: {
            lastTriggeredAt: new Date(),
            failureCount: 0,
          },
        });
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      this.logger.error(
        `Webhook delivery failed for ${webhook.url}: ${(error as Error).message}`,
      );

      await this.prisma.webhook.update({
        where: { id: webhook.id },
        data: {
          failureCount: { increment: 1 },
        },
      });
    }
  }
}
