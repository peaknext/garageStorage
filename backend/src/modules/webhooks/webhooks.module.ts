import { Module } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { WebhooksController } from './webhooks.controller';
import { AdminWebhooksController } from './admin-webhooks.controller';

@Module({
  providers: [WebhooksService],
  controllers: [WebhooksController, AdminWebhooksController],
  exports: [WebhooksService],
})
export class WebhooksModule {}
