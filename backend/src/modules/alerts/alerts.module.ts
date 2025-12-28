import { Module } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { NotificationService } from './notification.service';
import { AdminAlertsController } from './admin-alerts.controller';
import { WebhooksModule } from '../webhooks/webhooks.module';

@Module({
  imports: [WebhooksModule],
  providers: [AlertsService, NotificationService],
  controllers: [AdminAlertsController],
  exports: [AlertsService, NotificationService],
})
export class AlertsModule {}
