import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../services/cache/cache.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { REQUIRED_PERMISSION_KEY } from '../decorators/require-permission.decorator';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
    private cache: CacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];

    if (!apiKey) {
      throw new UnauthorizedException('API key is required');
    }

    // Try cache first
    const cacheKey = `apikey:${this.hashKey(apiKey)}`;
    const cachedApp = await this.cache.get(cacheKey);

    if (cachedApp) {
      const app = JSON.parse(cachedApp);
      request.application = app;
      await this.checkPermissions(context, request, app.id);
      return true;
    }

    // Find application by API key
    const applications = await this.prisma.application.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        slug: true,
        apiKeyHash: true,
        allowedOrigins: true,
        maxStorageBytes: true,
        usedStorageBytes: true,
      },
    });

    // Verify API key (bcrypt compare)
    for (const app of applications) {
      const isValid = await bcrypt.compare(apiKey, app.apiKeyHash);
      if (isValid) {
        // Check origin if configured
        const origin = request.headers['origin'];
        if (app.allowedOrigins.length > 0 && origin) {
          if (!app.allowedOrigins.includes(origin)) {
            throw new UnauthorizedException('Origin not allowed');
          }
        }

        // Remove sensitive data and convert BigInt to Number
        const { apiKeyHash, ...rest } = app;
        const safeApp = {
          ...rest,
          maxStorageBytes: Number(rest.maxStorageBytes),
          usedStorageBytes: Number(rest.usedStorageBytes),
        };
        request.application = safeApp;

        // Cache for 5 minutes
        await this.cache.set(cacheKey, JSON.stringify(safeApp), 300);

        // Check ACL permissions
        await this.checkPermissions(context, request, app.id);

        return true;
      }
    }

    throw new UnauthorizedException('Invalid API key');
  }

  /**
   * Check if the API key has the required permission for this endpoint.
   * If no permissions are configured, ALL access is granted (backward compatible).
   */
  private async checkPermissions(
    context: ExecutionContext,
    request: any,
    appId: string,
  ): Promise<void> {
    const requiredPermission = this.reflector.getAllAndOverride<string>(
      REQUIRED_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no permission decorator, allow access (backward compatible)
    if (!requiredPermission) {
      return;
    }

    // Check cached permissions
    const permCacheKey = `apikey-perms:${appId}`;
    let permissions: Array<{ scope: string; bucketId: string | null; permissions: string[] }>;

    const cachedPerms = await this.cache.get(permCacheKey);
    if (cachedPerms) {
      permissions = JSON.parse(cachedPerms);
    } else {
      const dbPerms = await this.prisma.apiKeyPermission.findMany({
        where: { applicationId: appId },
      });

      // If no permissions configured, default to ALL access
      if (dbPerms.length === 0) {
        return;
      }

      permissions = dbPerms.map((p) => ({
        scope: p.scope,
        bucketId: p.bucketId,
        permissions: p.permissions,
      }));

      await this.cache.set(permCacheKey, JSON.stringify(permissions), 300);
    }

    // Check if any permission rule grants access
    const bucketId = request.params?.bucketId;

    const hasPermission = permissions.some((perm) => {
      // ALL scope grants everything
      if (perm.scope === 'ALL') return true;

      // READ_ONLY scope only grants read permission
      if (perm.scope === 'READ_ONLY') {
        return requiredPermission === 'read';
      }

      // BUCKET scope: check bucket match + permission
      if (perm.scope === 'BUCKET') {
        if (perm.bucketId && bucketId && perm.bucketId !== bucketId) {
          return false;
        }
        return perm.permissions.includes(requiredPermission);
      }

      return false;
    });

    if (!hasPermission) {
      throw new ForbiddenException(
        `API key does not have '${requiredPermission}' permission`,
      );
    }
  }

  private hashKey(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex').substring(0, 16);
  }
}
