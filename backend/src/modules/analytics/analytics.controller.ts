import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiSecurity, ApiQuery } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { CurrentApp } from '../../common/decorators/current-app.decorator';

@ApiTags('analytics')
@Controller('analytics')
@UseGuards(ApiKeyGuard)
@ApiSecurity('api-key')
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Get storage overview' })
  async getOverview(@CurrentApp() app: { id: string }) {
    return this.analyticsService.getOverview(app.id);
  }

  @Get('usage')
  @ApiOperation({ summary: 'Get usage over time' })
  @ApiQuery({ name: 'from', required: true, type: String })
  @ApiQuery({ name: 'to', required: true, type: String })
  @ApiQuery({
    name: 'interval',
    required: false,
    enum: ['hour', 'day', 'week', 'month'],
  })
  async getUsage(
    @CurrentApp() app: { id: string },
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('interval') interval?: 'hour' | 'day' | 'week' | 'month',
  ) {
    return this.analyticsService.getUsageOverTime(
      app.id,
      new Date(from),
      new Date(to),
      interval,
    );
  }

  @Get('files/top')
  @ApiOperation({ summary: 'Get top downloaded files' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'period',
    required: false,
    enum: ['day', 'week', 'month', 'all'],
  })
  async getTopFiles(
    @CurrentApp() app: { id: string },
    @Query('limit') limit?: number,
    @Query('period') period?: 'day' | 'week' | 'month' | 'all',
  ) {
    return this.analyticsService.getTopFiles(app.id, limit, period);
  }
}
