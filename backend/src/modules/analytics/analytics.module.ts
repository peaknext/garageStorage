import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { AdminAnalyticsController } from './admin-analytics.controller';

@Module({
  providers: [AnalyticsService],
  controllers: [AnalyticsController, AdminAnalyticsController],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
