import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface GarageBucket {
  id: string;
  created: string;
  globalAliases: string[];
  localAliases: Array<{
    accessKeyId: string;
    alias: string;
  }>;
}

@Injectable()
export class GarageAdminService {
  private readonly logger = new Logger(GarageAdminService.name);
  private readonly adminEndpoint: string;
  private readonly adminToken: string;

  constructor(private configService: ConfigService) {
    this.adminEndpoint = this.configService.get('garage.adminEndpoint') || 'http://localhost:3903';
    this.adminToken = this.configService.get('garage.adminToken') || '';
  }

  /**
   * List all buckets from Garage admin API
   */
  async listBuckets(): Promise<GarageBucket[]> {
    const response = await fetch(`${this.adminEndpoint}/v1/bucket`, {
      headers: {
        Authorization: `Bearer ${this.adminToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`Failed to list buckets from Garage: ${error}`);
      throw new Error(`Garage admin API error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Get bucket details by ID
   */
  async getBucket(bucketId: string): Promise<GarageBucket | null> {
    const response = await fetch(`${this.adminEndpoint}/v1/bucket?id=${bucketId}`, {
      headers: {
        Authorization: `Bearer ${this.adminToken}`,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Garage admin API error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Get the primary alias name for a bucket
   */
  getBucketName(bucket: GarageBucket): string {
    // Prefer global aliases, then local aliases
    if (bucket.globalAliases.length > 0) {
      return bucket.globalAliases[0];
    }
    if (bucket.localAliases.length > 0) {
      return bucket.localAliases[0].alias;
    }
    return bucket.id;
  }
}
