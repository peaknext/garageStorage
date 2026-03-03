import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { WebhooksService } from '../webhooks/webhooks.service';
import { AlertLevel } from '../../generated/prisma';

export interface QuotaAlertPayload {
  level: AlertLevel;
  applicationId: string;
  applicationName: string;
  usage: number;
  threshold: number;
  emails: string[];
  sendWebhook: boolean;
  isTest?: boolean;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(
    private configService: ConfigService,
    private webhooksService: WebhooksService,
  ) {
    this.initializeEmailTransport();
  }

  private initializeEmailTransport() {
    const host = this.configService.get<string>('email.host');
    const port = this.configService.get<number>('email.port');
    const user = this.configService.get<string>('email.user');
    const password = this.configService.get<string>('email.password');

    if (host && user && password) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: this.configService.get<boolean>('email.secure'),
        auth: { user, pass: password },
      });
      this.logger.log('Email transport initialized');
    } else {
      this.logger.warn('Email transport not configured - email notifications disabled');
    }
  }

  async sendQuotaAlert(payload: QuotaAlertPayload) {
    const promises: Promise<any>[] = [];

    // Send emails
    if (payload.emails.length > 0 && this.transporter) {
      promises.push(this.sendEmail(payload));
    }

    // Trigger webhooks
    if (payload.sendWebhook) {
      promises.push(this.triggerWebhook(payload));
    }

    await Promise.allSettled(promises);
  }

  private async sendEmail(payload: QuotaAlertPayload) {
    if (!this.transporter) {
      this.logger.warn('Email transport not available');
      return;
    }

    const subject = payload.isTest
      ? `[TEST] Storage Quota ${payload.level} - ${payload.applicationName}`
      : `Storage Quota ${payload.level} - ${payload.applicationName}`;

    const html = this.generateEmailHtml(payload);

    try {
      await this.transporter.sendMail({
        from: this.configService.get<string>('email.from'),
        to: payload.emails.join(', '),
        subject,
        html,
      });
      this.logger.log(`Quota alert email sent to ${payload.emails.length} recipients`);
    } catch (error) {
      this.logger.error(`Failed to send quota alert email: ${error.message}`);
    }
  }

  private generateEmailHtml(payload: QuotaAlertPayload): string {
    const levelColor = payload.level === AlertLevel.CRITICAL ? '#dc2626' : '#f59e0b';
    const levelText = payload.level === AlertLevel.CRITICAL ? 'Critical' : 'Warning';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: ${levelColor}; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9f9f9; }
          .stats { background-color: white; padding: 15px; margin: 15px 0; border-radius: 5px; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Storage Quota ${levelText}${payload.isTest ? ' (TEST)' : ''}</h1>
          </div>
          <div class="content">
            <p>The application <strong>${payload.applicationName}</strong> has reached ${payload.usage.toFixed(1)}% of its storage quota.</p>

            <div class="stats">
              <p><strong>Current Usage:</strong> ${payload.usage.toFixed(1)}%</p>
              <p><strong>Threshold:</strong> ${payload.threshold}%</p>
              <p><strong>Alert Level:</strong> ${levelText}</p>
            </div>

            <p>Please take action to free up storage or increase the quota for this application.</p>
          </div>
          <div class="footer">
            <p>This is an automated message from SKH Storage.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private async triggerWebhook(payload: QuotaAlertPayload) {
    try {
      const eventType = payload.level === AlertLevel.CRITICAL
        ? 'quota.critical'
        : 'quota.warning';

      await this.webhooksService.trigger(payload.applicationId, eventType, {
        level: payload.level,
        usage: payload.usage,
        threshold: payload.threshold,
        applicationName: payload.applicationName,
        isTest: payload.isTest,
        timestamp: new Date().toISOString(),
      });

      this.logger.log(`Quota webhook triggered for ${payload.applicationName}`);
    } catch (error) {
      this.logger.error(`Failed to trigger quota webhook: ${error.message}`);
    }
  }
}
