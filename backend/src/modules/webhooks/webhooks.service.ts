import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import * as crypto from 'crypto';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private prisma: PrismaService,
    @InjectQueue('webhook') private webhookQueue: Queue,
  ) {}

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
      // Create delivery record and queue for async processing
      const delivery = await this.prisma.webhookDelivery.create({
        data: {
          webhookId: webhook.id,
          event,
          payload: { event, timestamp: new Date().toISOString(), data: payload },
          status: 'PENDING',
        },
      });

      await this.webhookQueue.add('deliver', {
        deliveryId: delivery.id,
        webhookId: webhook.id,
        attempt: 1,
      });
    }
  }

  async getDeliveries(webhookId: string, query: { page?: number; limit?: number }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    const [deliveries, total] = await Promise.all([
      this.prisma.webhookDelivery.findMany({
        where: { webhookId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.webhookDelivery.count({ where: { webhookId } }),
    ]);

    return {
      data: deliveries,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async retryDelivery(deliveryId: string) {
    const delivery = await this.prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
    });

    if (!delivery) {
      throw new NotFoundException('Delivery not found');
    }

    await this.prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: { status: 'RETRYING', attempt: 1 },
    });

    await this.webhookQueue.add('deliver', {
      deliveryId: delivery.id,
      webhookId: delivery.webhookId,
      attempt: 1,
    });

    return { message: 'Retry queued' };
  }

  // Used by the webhook processor
  async sendWebhook(
    webhook: { id: string; url: string; secret: string },
    deliveryId: string,
    payload: any,
    event: string,
  ): Promise<{ success: boolean; statusCode?: number; error?: string }> {
    const body = JSON.stringify(payload);

    const signature = crypto
      .createHmac('sha256', webhook.secret)
      .update(body)
      .digest('hex');

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': event,
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const responseBody = await response.text().catch(() => '');

      if (response.ok) {
        await this.prisma.webhook.update({
          where: { id: webhook.id },
          data: { lastTriggeredAt: new Date(), failureCount: 0 },
        });

        await this.prisma.webhookDelivery.update({
          where: { id: deliveryId },
          data: {
            status: 'SUCCESS',
            statusCode: response.status,
            responseBody: responseBody.substring(0, 1000),
          },
        });

        return { success: true, statusCode: response.status };
      } else {
        throw new Error(`HTTP ${response.status}: ${responseBody.substring(0, 200)}`);
      }
    } catch (error) {
      const errorMessage = (error as Error).message;
      this.logger.error(`Webhook delivery failed for ${webhook.url}: ${errorMessage}`);

      await this.prisma.webhook.update({
        where: { id: webhook.id },
        data: { failureCount: { increment: 1 } },
      });

      return { success: false, error: errorMessage };
    }
  }
}
