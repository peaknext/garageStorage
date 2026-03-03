import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { WebhooksService } from './webhooks.service';
import { WebhookProcessor } from './webhook.processor';
import { WebhooksController } from './webhooks.controller';
import { AdminWebhooksController } from './admin-webhooks.controller';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'webhook' }),
  ],
  providers: [WebhooksService, WebhookProcessor],
  controllers: [WebhooksController, AdminWebhooksController],
  exports: [WebhooksService],
})
export class WebhooksModule {}
