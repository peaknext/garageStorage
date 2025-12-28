import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AlertsService, CreateAlertDto } from './alerts.service';

@ApiTags('admin-alerts')
@Controller('admin/alerts')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminAlertsController {
  constructor(private alertsService: AlertsService) {}

  @Get()
  @ApiOperation({ summary: 'List all quota alerts' })
  async listAlerts() {
    return this.alertsService.findAll();
  }

  @Get(':appId')
  @ApiOperation({ summary: 'Get alert settings for an application' })
  async getAlert(@Param('appId') appId: string) {
    return this.alertsService.findByApplication(appId);
  }

  @Post(':appId')
  @ApiOperation({ summary: 'Create or update alert settings for an application' })
  async createOrUpdateAlert(
    @Param('appId') appId: string,
    @Body() dto: Omit<CreateAlertDto, 'applicationId'>,
  ) {
    return this.alertsService.createOrUpdate({
      ...dto,
      applicationId: appId,
    });
  }

  @Delete(':appId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Disable alerts for an application' })
  async deleteAlert(@Param('appId') appId: string) {
    return this.alertsService.delete(appId);
  }

  @Post(':appId/test')
  @ApiOperation({ summary: 'Send a test notification' })
  async testAlert(@Param('appId') appId: string) {
    return this.alertsService.testAlert(appId);
  }
}
