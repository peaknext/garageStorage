import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { CronExpressionParser } from 'cron-parser';
import { PrismaService } from '../../prisma/prisma.service';
import { PolicyScope, PolicyType, Prisma } from '../../generated/prisma';

export interface CreatePolicyDto {
  name: string;
  description?: string;
  scope?: PolicyScope;
  applicationId?: string;
  bucketId?: string;
  policyType: PolicyType;
  rules?: any;
  retentionDays?: number;
  deleteAfterDays?: number;
  schedule?: string;
  isActive?: boolean;
}

export interface UpdatePolicyDto {
  name?: string;
  description?: string;
  rules?: any;
  retentionDays?: number;
  deleteAfterDays?: number;
  schedule?: string;
  isActive?: boolean;
}

@Injectable()
export class PoliciesService {
  private readonly logger = new Logger(PoliciesService.name);

  constructor(private prisma: PrismaService) {}

  async create(dto: CreatePolicyDto) {
    if (dto.schedule) {
      this.validateCronExpression(dto.schedule);
    }
    const nextRunAt = dto.schedule ? this.calculateNextRun(dto.schedule) : null;

    return this.prisma.storagePolicy.create({
      data: {
        name: dto.name,
        description: dto.description,
        scope: dto.scope || PolicyScope.GLOBAL,
        applicationId: dto.applicationId,
        bucketId: dto.bucketId,
        policyType: dto.policyType,
        rules: dto.rules,
        retentionDays: dto.retentionDays,
        deleteAfterDays: dto.deleteAfterDays,
        schedule: dto.schedule,
        nextRunAt,
        isActive: dto.isActive ?? true,
      },
      include: {
        application: { select: { id: true, name: true } },
        bucket: { select: { id: true, name: true } },
      },
    });
  }

  async findAll(query: { page?: number; limit?: number; scope?: PolicyScope; policyType?: PolicyType }) {
    const { page = 1, limit = 50, scope, policyType } = query;

    const where: Prisma.StoragePolicyWhereInput = {};
    if (scope) where.scope = scope;
    if (policyType) where.policyType = policyType;

    const [policies, total] = await Promise.all([
      this.prisma.storagePolicy.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          application: { select: { id: true, name: true } },
          bucket: { select: { id: true, name: true } },
        },
      }),
      this.prisma.storagePolicy.count({ where }),
    ]);

    return {
      data: policies,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const policy = await this.prisma.storagePolicy.findUnique({
      where: { id },
      include: {
        application: { select: { id: true, name: true } },
        bucket: { select: { id: true, name: true } },
      },
    });

    if (!policy) {
      throw new NotFoundException('Policy not found');
    }

    return policy;
  }

  async update(id: string, dto: UpdatePolicyDto) {
    await this.findOne(id);

    if (dto.schedule) {
      this.validateCronExpression(dto.schedule);
    }
    const nextRunAt = dto.schedule ? this.calculateNextRun(dto.schedule) : undefined;

    return this.prisma.storagePolicy.update({
      where: { id },
      data: {
        ...dto,
        nextRunAt,
      },
      include: {
        application: { select: { id: true, name: true } },
        bucket: { select: { id: true, name: true } },
      },
    });
  }

  async delete(id: string) {
    await this.findOne(id);
    await this.prisma.storagePolicy.delete({ where: { id } });
  }

  async getActivePoliciesDueForExecution() {
    return this.prisma.storagePolicy.findMany({
      where: {
        isActive: true,
        nextRunAt: { lte: new Date() },
      },
      include: {
        application: true,
        bucket: true,
      },
    });
  }

  async markPolicyExecuted(id: string, nextRun?: Date) {
    return this.prisma.storagePolicy.update({
      where: { id },
      data: {
        lastRunAt: new Date(),
        nextRunAt: nextRun,
      },
    });
  }

  private validateCronExpression(schedule: string): void {
    try {
      CronExpressionParser.parse(schedule);
    } catch {
      throw new BadRequestException(
        `Invalid cron expression: "${schedule}". Use standard cron format (e.g., "0 0 * * *" for daily, "0 */6 * * *" for every 6 hours).`,
      );
    }
  }

  private calculateNextRun(schedule: string): Date {
    try {
      const interval = CronExpressionParser.parse(schedule);
      return interval.next().toDate();
    } catch {
      const next = new Date();
      next.setHours(next.getHours() + 24);
      return next;
    }
  }
}
