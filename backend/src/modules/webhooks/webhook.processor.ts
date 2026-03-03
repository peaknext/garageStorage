import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { WebhooksService } from './webhooks.service';

// Exponential backoff delays in milliseconds
const RETRY_DELAYS = [
  10 * 1000,       // 10 seconds
  60 * 1000,       // 1 minute
  5 * 60 * 1000,   // 5 minutes
  30 * 60 * 1000,  // 30 minutes
  2 * 60 * 60 * 1000, // 2 hours
];

@Processor('webhook')
export class WebhookProcessor {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(
    private prisma: PrismaService,
    private webhooksService: WebhooksService,
  ) {}

  @Process('deliver')
  async handleDelivery(job: Job<{ deliveryId: string; webhookId: string; attempt: number }>) {
    const { deliveryId, webhookId, attempt } = job.data;

    const delivery = await this.prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
    });

    if (!delivery) {
      this.logger.warn(`Delivery ${deliveryId} not found, skipping`);
      return;
    }

    const webhook = await this.prisma.webhook.findUnique({
      where: { id: webhookId },
    });

    if (!webhook || !webhook.isActive) {
      await this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: { status: 'FAILED', errorMessage: 'Webhook not found or inactive' },
      });
      return;
    }

    this.logger.log(`Delivering webhook ${webhookId} to ${webhook.url} (attempt ${attempt})`);

    const result = await this.webhooksService.sendWebhook(
      webhook,
      deliveryId,
      delivery.payload,
      delivery.event,
    );

    if (result.success) {
      this.logger.log(`Webhook delivery ${deliveryId} succeeded`);
      return;
    }

    // Delivery failed - check if we should retry
    const maxAttempts = delivery.maxAttempts || 5;
    if (attempt < maxAttempts) {
      const nextAttempt = attempt + 1;
      const delay = RETRY_DELAYS[Math.min(attempt - 1, RETRY_DELAYS.length - 1)];
      const nextRetryAt = new Date(Date.now() + delay);

      await this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'RETRYING',
          attempt: nextAttempt,
          nextRetryAt,
          errorMessage: result.error,
        },
      });

      // Queue the retry with delay
      await job.queue.add(
        'deliver',
        { deliveryId, webhookId, attempt: nextAttempt },
        { delay },
      );

      this.logger.log(
        `Webhook delivery ${deliveryId} failed, retrying in ${delay / 1000}s (attempt ${nextAttempt}/${maxAttempts})`,
      );
    } else {
      // Max retries exhausted
      await this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'FAILED',
          errorMessage: result.error,
        },
      });

      this.logger.error(
        `Webhook delivery ${deliveryId} failed after ${maxAttempts} attempts`,
      );
    }
  }
}
