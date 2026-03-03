import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { S3Service } from '../../../services/s3/s3.service';

@Injectable()
export class S3HealthIndicator extends HealthIndicator {
  constructor(private readonly s3: S3Service) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      await this.s3.listFiles('storage-service', '', 1);
      return this.getStatus(key, true);
    } catch (error) {
      throw new HealthCheckError(
        'S3 check failed',
        this.getStatus(key, false, { message: error.message }),
      );
    }
  }
}
