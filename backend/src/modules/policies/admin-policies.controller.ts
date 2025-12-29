import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PoliciesService, CreatePolicyDto, UpdatePolicyDto } from './policies.service';
import { PolicyExecutorService } from './policy-executor.service';
import { PolicyScope, PolicyType, ActorType, AuditStatus } from '@prisma/client';

@ApiTags('admin-policies')
@Controller('admin/policies')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminPoliciesController {
  constructor(
    private policiesService: PoliciesService,
    private policyExecutor: PolicyExecutorService,
    private eventEmitter: EventEmitter2,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List storage policies' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'scope', required: false, enum: PolicyScope })
  @ApiQuery({ name: 'policyType', required: false, enum: PolicyType })
  async listPolicies(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('scope') scope?: PolicyScope,
    @Query('policyType') policyType?: PolicyType,
  ) {
    return this.policiesService.findAll({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
      scope,
      policyType,
    });
  }

  @Post()
  @ApiOperation({ summary: 'Create a storage policy' })
  async createPolicy(@Body() dto: CreatePolicyDto) {
    return this.policiesService.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get policy details' })
  async getPolicy(@Param('id') id: string) {
    return this.policiesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a policy' })
  async updatePolicy(@Param('id') id: string, @Body() dto: UpdatePolicyDto) {
    return this.policiesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a policy' })
  async deletePolicy(@Param('id') id: string) {
    return this.policiesService.delete(id);
  }

  @Post(':id/execute')
  @ApiOperation({ summary: 'Manually execute a policy' })
  async executePolicy(@Param('id') id: string, @Request() req: any) {
    const policy = await this.policiesService.findOne(id);
    const startTime = Date.now();

    try {
      const result = await this.policyExecutor.executePolicy(policy);
      const duration = Date.now() - startTime;

      // Emit audit event with detailed results
      this.eventEmitter.emit('audit.log', {
        actorType: ActorType.ADMIN_USER,
        actorId: req.user?.id,
        actorEmail: req.user?.email,
        action: 'POLICY_EXECUTED_MANUAL',
        resourceType: 'STORAGE_POLICY',
        resourceId: policy.id,
        resourceName: policy.name,
        metadata: {
          policyType: policy.policyType,
          triggerType: 'MANUAL',
          duration,
          ...result,
        },
      });

      return { success: true, duration, policyName: policy.name, policyType: policy.policyType, ...result };
    } catch (error) {
      const duration = Date.now() - startTime;

      // Emit failure audit event
      this.eventEmitter.emit('audit.log', {
        actorType: ActorType.ADMIN_USER,
        actorId: req.user?.id,
        actorEmail: req.user?.email,
        action: 'POLICY_EXECUTION_FAILED',
        resourceType: 'STORAGE_POLICY',
        resourceId: policy.id,
        resourceName: policy.name,
        status: AuditStatus.FAILURE,
        errorMessage: error.message,
        metadata: {
          policyType: policy.policyType,
          triggerType: 'MANUAL',
          duration,
        },
      });

      throw error;
    }
  }
}
