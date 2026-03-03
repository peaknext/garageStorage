import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiSecurity, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { SharesService } from './shares.service';
import { CreateShareDto } from './dto/create-share.dto';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { Public } from '../../common/decorators/public.decorator';
import { ShareResponseDto } from '../../common/dto/response.dto';

@ApiTags('shares')
@Controller()
export class SharesController {
  constructor(private sharesService: SharesService) {}

  // Protected endpoints (require API key)
  @Post('files/:fileId/shares')
  @UseGuards(ApiKeyGuard)
  @ApiSecurity('api-key')
  @ApiOperation({ summary: 'Create shareable link' })
  @ApiResponse({ status: 201, description: 'Share link created', type: ShareResponseDto })
  async createShare(
    @Param('fileId') fileId: string,
    @Body() dto: CreateShareDto,
  ) {
    return this.sharesService.createShare(fileId, dto);
  }

  @Get('files/:fileId/shares')
  @UseGuards(ApiKeyGuard)
  @ApiSecurity('api-key')
  @ApiOperation({ summary: 'List shares for a file' })
  @ApiResponse({ status: 200, description: 'List of share links', type: [ShareResponseDto] })
  async listShares(@Param('fileId') fileId: string) {
    return this.sharesService.listShares(fileId);
  }

  @Delete('files/:fileId/shares/:shareId')
  @UseGuards(ApiKeyGuard)
  @ApiSecurity('api-key')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke share link' })
  async revokeShare(
    @Param('fileId') fileId: string,
    @Param('shareId') shareId: string,
  ) {
    return this.sharesService.revokeShare(fileId, shareId);
  }

  // Public endpoints
  @Public()
  @Get('shares/:token')
  @ApiOperation({ summary: 'Get shared file info (Public)' })
  @ApiQuery({ name: 'password', required: false, type: String })
  async getShareInfo(
    @Param('token') token: string,
    @Query('password') password?: string,
  ) {
    return this.sharesService.getShareInfo(token, password);
  }

  @Public()
  @Get('shares/:token/download')
  @ApiOperation({ summary: 'Download shared file (Public)' })
  @ApiQuery({ name: 'password', required: false, type: String })
  async downloadShare(
    @Param('token') token: string,
    @Res() res: Response,
    @Query('password') password?: string,
  ) {
    const { url } = await this.sharesService.downloadShare(token, password);
    return res.redirect(url);
  }
}
