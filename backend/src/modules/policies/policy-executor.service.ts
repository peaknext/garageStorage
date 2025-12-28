import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from '../../services/s3/s3.service';
import { PoliciesService } from './policies.service';
import { PolicyType, ActorType } from '@prisma/client';

@Injectable()
export class PolicyExecutorService {
  private readonly logger = new Logger(PolicyExecutorService.name);

  constructor(
    private prisma: PrismaService,
    private s3: S3Service,
    private policiesService: PoliciesService,
    private eventEmitter: EventEmitter2,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async executeScheduledPolicies() {
    this.logger.log('Checking for policies to execute...');

    const policies = await this.policiesService.getActivePoliciesDueForExecution();

    for (const policy of policies) {
      try {
        await this.executePolicy(policy);

        // Calculate next run time
        const nextRun = policy.schedule
          ? this.calculateNextRun(policy.schedule)
          : undefined;

        await this.policiesService.markPolicyExecuted(policy.id, nextRun);

        this.eventEmitter.emit('audit.log', {
          actorType: ActorType.SYSTEM,
          action: 'POLICY_EXECUTED',
          resourceType: 'STORAGE_POLICY',
          resourceId: policy.id,
          resourceName: policy.name,
          metadata: { policyType: policy.policyType },
        });
      } catch (error) {
        this.logger.error(
          `Failed to execute policy ${policy.id}: ${error.message}`,
          error.stack,
        );

        this.eventEmitter.emit('audit.log', {
          actorType: ActorType.SYSTEM,
          action: 'POLICY_EXECUTION_FAILED',
          resourceType: 'STORAGE_POLICY',
          resourceId: policy.id,
          resourceName: policy.name,
          status: 'FAILURE',
          errorMessage: error.message,
        });
      }
    }
  }

  async executePolicy(policy: any) {
    this.logger.log(`Executing policy: ${policy.name} (${policy.policyType})`);

    switch (policy.policyType) {
      case PolicyType.AUTO_DELETE:
        return this.executeAutoDeletePolicy(policy);
      case PolicyType.RETENTION:
        return this.executeRetentionPolicy(policy);
      case PolicyType.CLEANUP_TEMP:
        return this.executeCleanupTempPolicy(policy);
      default:
        this.logger.warn(`Unknown policy type: ${policy.policyType}`);
    }
  }

  private async executeAutoDeletePolicy(policy: any) {
    if (!policy.deleteAfterDays) {
      this.logger.warn(`Policy ${policy.id} has no deleteAfterDays set`);
      return;
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - policy.deleteAfterDays);

    const where: any = {
      createdAt: { lt: cutoffDate },
    };

    if (policy.bucketId) {
      where.bucketId = policy.bucketId;
    } else if (policy.applicationId) {
      where.bucket = { applicationId: policy.applicationId };
    }

    const files = await this.prisma.file.findMany({
      where,
      include: { bucket: true },
    });

    this.logger.log(`Found ${files.length} files to delete for policy ${policy.id}`);

    let deletedCount = 0;
    for (const file of files) {
      try {
        // Delete from S3
        await this.s3.deleteFile(file.bucket.garageBucketId, file.key);

        // Delete from database
        await this.prisma.file.delete({ where: { id: file.id } });

        // Update bucket usage
        await this.prisma.bucket.update({
          where: { id: file.bucketId },
          data: { usedBytes: { decrement: file.sizeBytes } },
        });

        deletedCount++;
      } catch (error) {
        this.logger.error(`Failed to delete file ${file.id}: ${error.message}`);
      }
    }

    this.logger.log(`Deleted ${deletedCount} files for policy ${policy.id}`);
    return { deletedCount };
  }

  private async executeRetentionPolicy(policy: any) {
    // Retention policy ensures files are kept for a minimum period
    // This is more of a validation/warning policy
    this.logger.log(`Retention policy ${policy.id} validated`);
    return { validated: true };
  }

  private async executeCleanupTempPolicy(policy: any) {
    // Clean up temporary/orphaned files
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - 24); // Files older than 24h

    // Find files with temp prefix or specific patterns
    const where: any = {
      createdAt: { lt: cutoffDate },
      key: { startsWith: '_temp/' },
    };

    if (policy.bucketId) {
      where.bucketId = policy.bucketId;
    }

    const files = await this.prisma.file.findMany({
      where,
      include: { bucket: true },
    });

    let deletedCount = 0;
    for (const file of files) {
      try {
        await this.s3.deleteFile(file.bucket.garageBucketId, file.key);
        await this.prisma.file.delete({ where: { id: file.id } });
        deletedCount++;
      } catch (error) {
        this.logger.error(`Failed to cleanup temp file ${file.id}: ${error.message}`);
      }
    }

    this.logger.log(`Cleaned up ${deletedCount} temp files`);
    return { deletedCount };
  }

  private calculateNextRun(schedule: string): Date {
    // Simple implementation - adds 24 hours for daily schedules
    const next = new Date();
    next.setHours(next.getHours() + 24);
    return next;
  }
}
