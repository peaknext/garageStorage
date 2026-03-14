import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ApplicationsService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
  }) {
    const { status, search } = query;
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [apps, total] = await Promise.all([
      this.prisma.application.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          status: true,
          maxStorageBytes: true,
          usedStorageBytes: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              buckets: true,
            },
          },
        },
      }),
      this.prisma.application.count({ where }),
    ]);

    return {
      data: apps.map((app) => ({
        ...app,
        maxStorageBytes: Number(app.maxStorageBytes),
        usedStorageBytes: Number(app.usedStorageBytes),
        bucketCount: app._count.buckets,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const app = await this.prisma.application.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            buckets: true,
          },
        },
        buckets: {
          select: {
            _count: {
              select: {
                files: true,
              },
            },
          },
        },
      },
    });

    if (!app) {
      throw new NotFoundException('Application not found');
    }

    const fileCount = app.buckets.reduce(
      (sum, bucket) => sum + bucket._count.files,
      0,
    );

    return {
      id: app.id,
      name: app.name,
      slug: app.slug,
      description: app.description,
      status: app.status,
      webhookUrl: app.webhookUrl,
      allowedOrigins: app.allowedOrigins,
      maxStorageBytes: Number(app.maxStorageBytes),
      usedStorageBytes: Number(app.usedStorageBytes),
      bucketCount: app._count.buckets,
      fileCount,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
    };
  }

  async create(dto: CreateApplicationDto) {
    // Check if slug already exists
    const existing = await this.prisma.application.findUnique({
      where: { slug: dto.slug },
    });

    if (existing) {
      throw new BadRequestException('Slug already exists');
    }

    // Generate API key
    const apiKey = `gs_${uuidv4().replace(/-/g, '')}`;
    const apiKeyHash = await bcrypt.hash(apiKey, 10);

    const app = await this.prisma.application.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        description: dto.description,
        apiKeyHash,
        webhookUrl: dto.webhookUrl,
        allowedOrigins: dto.allowedOrigins || [],
        maxStorageBytes: dto.maxStorageBytes
          ? BigInt(dto.maxStorageBytes)
          : BigInt(10737418240), // 10GB
      },
    });

    return {
      id: app.id,
      name: app.name,
      slug: app.slug,
      apiKey, // Only returned on creation
      createdAt: app.createdAt,
    };
  }

  async update(id: string, dto: UpdateApplicationDto) {
    const app = await this.prisma.application.findUnique({
      where: { id },
    });

    if (!app) {
      throw new NotFoundException('Application not found');
    }

    const updated = await this.prisma.application.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        webhookUrl: dto.webhookUrl,
        allowedOrigins: dto.allowedOrigins,
        status: dto.status,
        maxStorageBytes: dto.maxStorageBytes
          ? BigInt(dto.maxStorageBytes)
          : undefined,
      },
    });

    return {
      id: updated.id,
      name: updated.name,
      updatedAt: updated.updatedAt,
    };
  }

  async regenerateApiKey(id: string) {
    const app = await this.prisma.application.findUnique({
      where: { id },
    });

    if (!app) {
      throw new NotFoundException('Application not found');
    }

    // Generate new API key
    const apiKey = `gs_${uuidv4().replace(/-/g, '')}`;
    const apiKeyHash = await bcrypt.hash(apiKey, 10);

    await this.prisma.application.update({
      where: { id },
      data: { apiKeyHash },
    });

    return { apiKey };
  }

  async delete(id: string) {
    const app = await this.prisma.application.findUnique({
      where: { id },
    });

    if (!app) {
      throw new NotFoundException('Application not found');
    }

    // Soft delete by setting status to DELETED
    await this.prisma.application.update({
      where: { id },
      data: { status: 'DELETED' },
    });
  }
}
