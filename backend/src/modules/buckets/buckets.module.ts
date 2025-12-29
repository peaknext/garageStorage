import { Module } from '@nestjs/common';
import { BucketsService } from './buckets.service';
import { BucketsController } from './buckets.controller';
import { AdminBucketsController } from './admin-buckets.controller';
import { WebhooksModule } from '../webhooks/webhooks.module';

@Module({
  imports: [WebhooksModule],
  providers: [BucketsService],
  controllers: [BucketsController, AdminBucketsController],
  exports: [BucketsService],
})
export class BucketsModule {}
