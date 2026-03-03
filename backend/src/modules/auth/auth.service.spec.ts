import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: any;
  let jwtService: any;

  const mockUser = {
    id: 'user-1',
    email: 'admin@example.com',
    passwordHash: '',
    name: 'Admin User',
    role: 'ADMIN',
    lastLoginAt: null,
    refreshTokenHash: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockUser.passwordHash = await bcrypt.hash('admin123', 10);

    prisma = {
      adminUser: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    jwtService = {
      sign: jest.fn().mockReturnValue('mock-jwt-token'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('login', () => {
    it('should return tokens and user for valid credentials', async () => {
      prisma.adminUser.findUnique.mockResolvedValue(mockUser);
      prisma.adminUser.update.mockResolvedValue(mockUser);

      const result = await service.login({
        email: 'admin@example.com',
        password: 'admin123',
      });

      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.refreshToken).toBeDefined();
      expect(result.refreshToken.length).toBeGreaterThan(20);
      expect(result.user.email).toBe('admin@example.com');
      expect(result.user.role).toBe('ADMIN');
      expect(result.user).not.toHaveProperty('passwordHash');

      expect(jwtService.sign).toHaveBeenCalledWith(
        { sub: 'user-1', email: 'admin@example.com', role: 'ADMIN' },
        { expiresIn: '15m' },
      );

      expect(prisma.adminUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({
            lastLoginAt: expect.any(Date),
            refreshTokenHash: expect.any(String),
          }),
        }),
      );
    });

    it('should throw UnauthorizedException for non-existent user', async () => {
      prisma.adminUser.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@example.com', password: 'test' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      prisma.adminUser.findUnique.mockResolvedValue(mockUser);

      await expect(
        service.login({ email: 'admin@example.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('should throw UnauthorizedException when no refresh token provided', async () => {
      await expect(service.refresh('')).rejects.toThrow(UnauthorizedException);
    });

    it('should return new tokens for valid refresh token', async () => {
      const refreshToken = 'valid-refresh-token';
      const refreshTokenHash = await bcrypt.hash(refreshToken, 10);

      prisma.adminUser.findMany.mockResolvedValue([
        { ...mockUser, refreshTokenHash },
      ]);
      prisma.adminUser.update.mockResolvedValue(mockUser);

      const result = await service.refresh(refreshToken);

      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.refreshToken).toBeDefined();
      expect(result.refreshToken).not.toBe(refreshToken); // Token rotated
    });

    it('should throw UnauthorizedException for invalid refresh token', async () => {
      prisma.adminUser.findMany.mockResolvedValue([]);

      await expect(service.refresh('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('should clear refresh token hash', async () => {
      prisma.adminUser.update.mockResolvedValue(mockUser);

      await service.logout('user-1');

      expect(prisma.adminUser.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { refreshTokenHash: null },
      });
    });
  });

  describe('register', () => {
    it('should create a new user and return tokens', async () => {
      prisma.adminUser.findUnique.mockResolvedValue(null);
      prisma.adminUser.create.mockResolvedValue({
        id: 'new-user-1',
        email: 'new@example.com',
        name: 'New User',
        role: 'VIEWER',
      });

      const result = await service.register({
        email: 'new@example.com',
        password: 'password123',
        name: 'New User',
      });

      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.user.email).toBe('new@example.com');
      expect(result.user.role).toBe('VIEWER');

      expect(prisma.adminUser.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'new@example.com',
          name: 'New User',
          role: 'VIEWER',
          passwordHash: expect.any(String),
        }),
      });
    });

    it('should throw BadRequestException for duplicate email', async () => {
      prisma.adminUser.findUnique.mockResolvedValue(mockUser);

      await expect(
        service.register({
          email: 'admin@example.com',
          password: 'password123',
          name: 'Dup User',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('validateUser', () => {
    it('should return user data without password', async () => {
      prisma.adminUser.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'admin@example.com',
        name: 'Admin User',
        role: 'ADMIN',
      });

      const result = await service.validateUser('user-1');

      expect(result).toEqual({
        id: 'user-1',
        email: 'admin@example.com',
        name: 'Admin User',
        role: 'ADMIN',
      });
    });

    it('should return null for non-existent user', async () => {
      prisma.adminUser.findUnique.mockResolvedValue(null);

      const result = await service.validateUser('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getProfile', () => {
    it('should return profile with login time', async () => {
      const profileData = {
        id: 'user-1',
        email: 'admin@example.com',
        name: 'Admin User',
        role: 'ADMIN',
        lastLoginAt: new Date(),
        createdAt: new Date(),
      };

      prisma.adminUser.findUnique.mockResolvedValue(profileData);

      const result = await service.getProfile('user-1');

      expect(result).toEqual(profileData);
      expect(prisma.adminUser.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          lastLoginAt: true,
          createdAt: true,
        },
      });
    });
  });
});
