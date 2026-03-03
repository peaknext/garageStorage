import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BullModule } from '@nestjs/bull';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule } from './prisma/prisma.module';
import { S3Module } from './services/s3/s3.module';
import { CacheModule } from './services/cache/cache.module';
import { AuthModule } from './modules/auth/auth.module';
import { ApplicationsModule } from './modules/applications/applications.module';
import { BucketsModule } from './modules/buckets/buckets.module';
import { FilesModule } from './modules/files/files.module';
import { SharesModule } from './modules/shares/shares.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { AuditModule } from './modules/audit/audit.module';
import { PoliciesModule } from './modules/policies/policies.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { TagsModule } from './modules/tags/tags.module';
import { FoldersModule } from './modules/folders/folders.module';
import { ProcessingModule } from './modules/processing/processing.module';
import { HealthModule } from './modules/health/health.module';
import { EventsModule } from './modules/events/events.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import configuration from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    // Structured JSON logging (pino)
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        pinoHttp: {
          level: configService.get('NODE_ENV') === 'production' ? 'info' : 'debug',
          transport:
            configService.get('NODE_ENV') !== 'production'
              ? { target: 'pino-pretty', options: { colorize: true, singleLine: true } }
              : undefined,
          autoLogging: {
            ignore: (req: any) => req.url === '/health',
          },
          customProps: (req: any) => ({
            correlationId: req.headers['x-request-id'],
          }),
        },
      }),
      inject: [ConfigService],
    }),
    // Schedule module for cron jobs (policies, alerts)
    ScheduleModule.forRoot(),
    // Event emitter for async audit logging
    EventEmitterModule.forRoot(),
    // Rate limiting
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,
        limit: 20,
      },
      {
        name: 'medium',
        ttl: 60000,
        limit: 100,
      },
      {
        name: 'long',
        ttl: 600000,
        limit: 500,
      },
    ]),
    // Bull queue for background processing (thumbnails, etc.)
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        redis: {
          host: configService.get('redis.host'),
          port: configService.get('redis.port'),
          password: configService.get('redis.password'),
        },
      }),
      inject: [ConfigService],
    }),
    PrismaModule,
    S3Module,
    CacheModule,
    AuthModule,
    ApplicationsModule,
    BucketsModule,
    FilesModule,
    SharesModule,
    AnalyticsModule,
    WebhooksModule,
    // New feature modules
    AuditModule,
    PoliciesModule,
    AlertsModule,
    TagsModule,
    FoldersModule,
    ProcessingModule,
    HealthModule,
    EventsModule,
    NotificationsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
