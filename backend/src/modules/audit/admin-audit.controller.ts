import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuditService, QueryAuditLogsDto } from './audit.service';
import { ActorType } from '../../generated/prisma';

@ApiTags('admin-audit')
@Controller('admin/audit')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminAuditController {
  constructor(private auditService: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'List audit logs with pagination and filters' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'actorType', required: false, enum: ActorType })
  @ApiQuery({ name: 'action', required: false, type: String })
  @ApiQuery({ name: 'resourceType', required: false, type: String })
  @ApiQuery({ name: 'resourceId', required: false, type: String })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'search', required: false, type: String })
  async listAuditLogs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('actorType') actorType?: ActorType,
    @Query('action') action?: string,
    @Query('resourceType') resourceType?: string,
    @Query('resourceId') resourceId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('search') search?: string,
  ) {
    const query: QueryAuditLogsDto = {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
      actorType,
      action,
      resourceType,
      resourceId,
      startDate,
      endDate,
      search,
    };

    return this.auditService.findAll(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get audit log statistics' })
  async getStats() {
    return this.auditService.getStats();
  }

  @Get('export')
  @ApiOperation({ summary: 'Export audit logs as CSV' })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'action', required: false, type: String })
  @ApiQuery({ name: 'resourceType', required: false, type: String })
  async exportLogs(
    @Query('startDate') startDate: string | undefined,
    @Query('endDate') endDate: string | undefined,
    @Query('action') action: string | undefined,
    @Query('resourceType') resourceType: string | undefined,
    @Res() res: Response,
  ) {
    const result = await this.auditService.findAll({
      page: 1,
      limit: 10000, // Export up to 10k records
      startDate,
      endDate,
      action,
      resourceType,
    });

    // Generate CSV
    const headers = [
      'ID',
      'Timestamp',
      'Actor Type',
      'Actor Email',
      'Action',
      'Resource Type',
      'Resource ID',
      'Resource Name',
      'Status',
      'IP Address',
    ];

    const rows = result.data.map((log) => [
      log.id,
      log.createdAt.toISOString(),
      log.actorType,
      log.actorEmail || '',
      log.action,
      log.resourceType,
      log.resourceId || '',
      log.resourceName || '',
      log.status,
      log.ipAddress || '',
    ]);

    const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=audit-logs-${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csv);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single audit log details' })
  async getAuditLog(@Param('id') id: string) {
    return this.auditService.findOne(id);
  }
}
