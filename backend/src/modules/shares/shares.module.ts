import { Module } from '@nestjs/common';
import { SharesService } from './shares.service';
import { SharesController } from './shares.controller';
import { AdminSharesController } from './admin-shares.controller';
import { WebhooksModule } from '../webhooks/webhooks.module';

@Module({
  imports: [WebhooksModule],
  providers: [SharesService],
  controllers: [SharesController, AdminSharesController],
  exports: [SharesService],
})
export class SharesModule {}
