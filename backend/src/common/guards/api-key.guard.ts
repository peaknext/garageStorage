import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../services/cache/cache.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
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
      request.application = JSON.parse(cachedApp);
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

        return true;
      }
    }

    throw new UnauthorizedException('Invalid API key');
  }

  private hashKey(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex').substring(0, 16);
  }
}
