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
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { WebhooksService } from './webhooks.service';
import { CreateWebhookDto } from './dto/create-webhook.dto';

@ApiTags('admin-webhooks')
@Controller('admin/applications/:appId/webhooks')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminWebhooksController {
  constructor(
    private prisma: PrismaService,
    private webhooksService: WebhooksService,
  ) {}

  private async verifyApplication(appId: string) {
    const app = await this.prisma.application.findUnique({
      where: { id: appId },
    });

    if (!app) {
      throw new NotFoundException('Application not found');
    }

    return app;
  }

  @Get()
  @ApiOperation({ summary: 'List webhooks for application (Admin)' })
  async findAll(@Param('appId') appId: string) {
    await this.verifyApplication(appId);
    return this.webhooksService.findAll(appId);
  }

  @Post()
  @ApiOperation({ summary: 'Create new webhook (Admin)' })
  async create(@Param('appId') appId: string, @Body() dto: CreateWebhookDto) {
    await this.verifyApplication(appId);
    return this.webhooksService.create(appId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update webhook (Admin)' })
  async update(
    @Param('appId') appId: string,
    @Param('id') id: string,
    @Body() dto: { url?: string; events?: string[]; isActive?: boolean },
  ) {
    await this.verifyApplication(appId);
    return this.webhooksService.update(appId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete webhook (Admin)' })
  async delete(@Param('appId') appId: string, @Param('id') id: string) {
    await this.verifyApplication(appId);
    return this.webhooksService.delete(appId, id);
  }

  @Post(':id/test')
  @ApiOperation({ summary: 'Send test webhook event (Admin)' })
  async sendTest(@Param('appId') appId: string, @Param('id') id: string) {
    await this.verifyApplication(appId);

    const webhook = await this.prisma.webhook.findFirst({
      where: { id, applicationId: appId },
    });

    if (!webhook) {
      throw new NotFoundException('Webhook not found');
    }

    await this.webhooksService.trigger(appId, 'test', {
      message: 'This is a test webhook event',
      webhookId: id,
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      message: 'Test webhook sent',
    };
  }

  @Get(':id/deliveries')
  @ApiOperation({ summary: 'Get webhook delivery logs (Admin)' })
  async getDeliveries(
    @Param('appId') appId: string,
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    await this.verifyApplication(appId);
    return this.webhooksService.getDeliveries(id, {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Post(':id/deliveries/:deliveryId/retry')
  @ApiOperation({ summary: 'Retry a failed webhook delivery (Admin)' })
  async retryDelivery(
    @Param('appId') appId: string,
    @Param('id') id: string,
    @Param('deliveryId') deliveryId: string,
  ) {
    await this.verifyApplication(appId);
    return this.webhooksService.retryDelivery(deliveryId);
  }
}
