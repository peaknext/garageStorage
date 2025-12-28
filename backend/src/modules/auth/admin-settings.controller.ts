import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@ApiTags('admin-settings')
@Controller('admin/settings')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminSettingsController {
  constructor(private prisma: PrismaService) {}

  @Patch('profile')
  @ApiOperation({ summary: 'Update admin profile' })
  async updateProfile(
    @Request() req: { user: { sub: string } },
    @Body() dto: { name?: string },
  ) {
    const user = await this.prisma.adminUser.update({
      where: { id: req.user.sub },
      data: { name: dto.name },
    });

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }

  @Post('change-password')
  @ApiOperation({ summary: 'Change admin password' })
  async changePassword(
    @Request() req: { user: { sub: string } },
    @Body() dto: { currentPassword: string; newPassword: string },
  ) {
    const user = await this.prisma.adminUser.findUnique({
      where: { id: req.user.sub },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    const isPasswordValid = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    if (dto.newPassword.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters');
    }

    const newPasswordHash = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.adminUser.update({
      where: { id: req.user.sub },
      data: { passwordHash: newPasswordHash },
    });

    return { message: 'Password changed successfully' };
  }

  @Get('admins')
  @ApiOperation({ summary: 'List all admin users' })
  async listAdmins() {
    const admins = await this.prisma.adminUser.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return { data: admins };
  }

  @Post('admins')
  @ApiOperation({ summary: 'Create new admin user' })
  async createAdmin(
    @Body() dto: { email: string; password: string; name: string },
  ) {
    // Check if email already exists
    const existing = await this.prisma.adminUser.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('Email already exists');
    }

    if (dto.password.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const admin = await this.prisma.adminUser.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name,
        role: 'ADMIN',
      },
    });

    return {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    };
  }

  @Delete('admins/:id')
  @ApiOperation({ summary: 'Delete admin user' })
  async deleteAdmin(
    @Request() req: { user: { sub: string } },
    @Param('id') id: string,
  ) {
    // Prevent self-deletion
    if (req.user.sub === id) {
      throw new BadRequestException('Cannot delete your own account');
    }

    // Check if admin exists
    const admin = await this.prisma.adminUser.findUnique({
      where: { id },
    });

    if (!admin) {
      throw new BadRequestException('Admin not found');
    }

    await this.prisma.adminUser.delete({
      where: { id },
    });

    return { message: 'Admin deleted successfully' };
  }
}
