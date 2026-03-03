import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.adminUser.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Generate refresh token
    const refreshToken = crypto.randomBytes(40).toString('hex');
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);

    // Update last login and store refresh token
    await this.prisma.adminUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), refreshTokenHash },
    });

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return {
      accessToken: this.jwtService.sign(payload, { expiresIn: '15m' }),
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  async refresh(refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token required');
    }

    // Find users with refresh tokens
    const users = await this.prisma.adminUser.findMany({
      where: { refreshTokenHash: { not: null } },
    });

    let matchedUser = null;
    for (const user of users) {
      if (user.refreshTokenHash && await bcrypt.compare(refreshToken, user.refreshTokenHash)) {
        matchedUser = user;
        break;
      }
    }

    if (!matchedUser) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Rotate refresh token
    const newRefreshToken = crypto.randomBytes(40).toString('hex');
    const newRefreshTokenHash = await bcrypt.hash(newRefreshToken, 10);

    await this.prisma.adminUser.update({
      where: { id: matchedUser.id },
      data: { refreshTokenHash: newRefreshTokenHash },
    });

    const payload = {
      sub: matchedUser.id,
      email: matchedUser.email,
      role: matchedUser.role,
    };

    return {
      accessToken: this.jwtService.sign(payload, { expiresIn: '15m' }),
      refreshToken: newRefreshToken,
    };
  }

  async logout(userId: string) {
    await this.prisma.adminUser.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });
  }

  async register(dto: RegisterDto) {
    // Check if email already exists
    const existingUser = await this.prisma.adminUser.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new BadRequestException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.adminUser.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name,
        role: 'VIEWER',
      },
    });

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return {
      accessToken: this.jwtService.sign(payload, { expiresIn: '15m' }),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  async validateUser(userId: string) {
    return this.prisma.adminUser.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });
  }

  async getProfile(userId: string) {
    return this.prisma.adminUser.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });
  }
}
