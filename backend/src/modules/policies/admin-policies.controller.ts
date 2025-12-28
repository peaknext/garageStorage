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
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PoliciesService, CreatePolicyDto, UpdatePolicyDto } from './policies.service';
import { PolicyExecutorService } from './policy-executor.service';
import { PolicyScope, PolicyType } from '@prisma/client';

@ApiTags('admin-policies')
@Controller('admin/policies')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminPoliciesController {
  constructor(
    private policiesService: PoliciesService,
    private policyExecutor: PolicyExecutorService,
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
  async executePolicy(@Param('id') id: string) {
    const policy = await this.policiesService.findOne(id);
    return this.policyExecutor.executePolicy(policy);
  }
}
