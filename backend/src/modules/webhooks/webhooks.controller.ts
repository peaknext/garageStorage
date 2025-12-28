import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiSecurity } from '@nestjs/swagger';
import { WebhooksService } from './webhooks.service';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { CurrentApp } from '../../common/decorators/current-app.decorator';

@ApiTags('webhooks')
@Controller('webhooks')
@UseGuards(ApiKeyGuard)
@ApiSecurity('api-key')
export class WebhooksController {
  constructor(private webhooksService: WebhooksService) {}

  @Get()
  @ApiOperation({ summary: 'List webhooks for current application' })
  async findAll(@CurrentApp() app: { id: string }) {
    return this.webhooksService.findAll(app.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create new webhook' })
  async create(
    @CurrentApp() app: { id: string },
    @Body() dto: CreateWebhookDto,
  ) {
    return this.webhooksService.create(app.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update webhook' })
  async update(
    @CurrentApp() app: { id: string },
    @Param('id') id: string,
    @Body() dto: { url?: string; events?: string[]; isActive?: boolean },
  ) {
    return this.webhooksService.update(app.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete webhook' })
  async delete(@CurrentApp() app: { id: string }, @Param('id') id: string) {
    return this.webhooksService.delete(app.id, id);
  }
}
