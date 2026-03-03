import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { CacheService } from '../../../services/cache/cache.service';

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(private readonly cache: CacheService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      await this.cache.set('health:ping', 'pong', 10);
      const result = await this.cache.get('health:ping');
      if (result === 'pong') {
        return this.getStatus(key, true);
      }
      throw new Error('Redis ping failed');
    } catch (error) {
      throw new HealthCheckError(
        'Redis check failed',
        this.getStatus(key, false, { message: error.message }),
      );
    }
  }
}
