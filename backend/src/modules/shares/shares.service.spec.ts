import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { SharesService } from './shares.service';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from '../../services/s3/s3.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import * as bcrypt from 'bcrypt';

describe('SharesService', () => {
  let service: SharesService;
  let prisma: any;
  let s3: any;
  let webhooks: any;

  const mockBucket = {
    id: 'bucket-1',
    applicationId: 'app-1',
    garageBucketId: 'garage-bucket-1',
  };

  const mockFile = {
    id: 'file-1',
    key: 'uploads/test.pdf',
    originalName: 'test.pdf',
    mimeType: 'application/pdf',
    sizeBytes: BigInt(1024),
    bucket: mockBucket,
  };

  const mockShare = {
    id: 'share-1',
    token: 'abc123token',
    fileId: 'file-1',
    expiresAt: null as Date | null,
    maxDownloads: null as number | null,
    downloadCount: 0,
    passwordHash: null as string | null,
    allowPreview: true,
    createdAt: new Date(),
    file: mockFile,
  };

  beforeEach(async () => {
    prisma = {
      file: {
        findUnique: jest.fn(),
      },
      fileShare: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    s3 = {
      getPresignedDownloadUrl: jest
        .fn()
        .mockResolvedValue('https://s3.example.com/signed-url'),
    };

    webhooks = {
      trigger: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SharesService,
        { provide: PrismaService, useValue: prisma },
        { provide: S3Service, useValue: s3 },
        { provide: WebhooksService, useValue: webhooks },
      ],
    }).compile();

    service = module.get<SharesService>(SharesService);
  });

  describe('createShare', () => {
    it('should create a share link and trigger webhook', async () => {
      prisma.file.findUnique.mockResolvedValue(mockFile);
      prisma.fileShare.create.mockResolvedValue(mockShare);

      const result = await service.createShare('file-1', {});

      expect(result.id).toBe('share-1');
      expect(result.token).toBe('abc123token');
      expect(result.shareUrl).toContain('/api/v1/shares/abc123token/download');

      expect(webhooks.trigger).toHaveBeenCalledWith(
        'app-1',
        'share.created',
        expect.objectContaining({
          shareId: 'share-1',
          fileId: 'file-1',
        }),
      );
    });

    it('should throw NotFoundException for non-existent file', async () => {
      prisma.file.findUnique.mockResolvedValue(null);

      await expect(service.createShare('non-existent', {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should set expiry when expiresIn is provided', async () => {
      prisma.file.findUnique.mockResolvedValue(mockFile);
      prisma.fileShare.create.mockResolvedValue(mockShare);

      await service.createShare('file-1', { expiresIn: 3600 });

      expect(prisma.fileShare.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          fileId: 'file-1',
          expiresAt: expect.any(Date),
        }),
      });
    });

    it('should hash password when password is provided', async () => {
      prisma.file.findUnique.mockResolvedValue(mockFile);
      prisma.fileShare.create.mockResolvedValue(mockShare);

      await service.createShare('file-1', { password: 'secret' });

      const createCall = prisma.fileShare.create.mock.calls[0][0];
      expect(createCall.data.passwordHash).toBeDefined();
      expect(createCall.data.passwordHash.length).toBeGreaterThan(10);
    });

    it('should set maxDownloads when provided', async () => {
      prisma.file.findUnique.mockResolvedValue(mockFile);
      prisma.fileShare.create.mockResolvedValue(mockShare);

      await service.createShare('file-1', { maxDownloads: 5 });

      expect(prisma.fileShare.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          maxDownloads: 5,
        }),
      });
    });
  });

  describe('getShareInfo', () => {
    it('should return share info with download URL', async () => {
      prisma.fileShare.findUnique.mockResolvedValue(mockShare);

      const result = await service.getShareInfo('abc123token');

      expect(result.fileName).toBe('test.pdf');
      expect(result.mimeType).toBe('application/pdf');
      expect(result.sizeBytes).toBe(1024);
      expect(result.downloadUrl).toBe('https://s3.example.com/signed-url');

      expect(s3.getPresignedDownloadUrl).toHaveBeenCalledWith(
        'garage-bucket-1',
        'uploads/test.pdf',
        3600,
        'test.pdf',
      );
    });

    it('should throw NotFoundException for invalid token', async () => {
      prisma.fileShare.findUnique.mockResolvedValue(null);

      await expect(service.getShareInfo('invalid')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException for expired share', async () => {
      const expiredShare = {
        ...mockShare,
        expiresAt: new Date(Date.now() - 60000), // Expired 1 minute ago
      };
      prisma.fileShare.findUnique.mockResolvedValue(expiredShare);

      await expect(service.getShareInfo('abc123token')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw ForbiddenException when download limit reached', async () => {
      const limitedShare = {
        ...mockShare,
        maxDownloads: 5,
        downloadCount: 5,
      };
      prisma.fileShare.findUnique.mockResolvedValue(limitedShare);

      await expect(service.getShareInfo('abc123token')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw UnauthorizedException when password required but not provided', async () => {
      const passwordShare = {
        ...mockShare,
        passwordHash: await bcrypt.hash('secret', 10),
      };
      prisma.fileShare.findUnique.mockResolvedValue(passwordShare);

      await expect(service.getShareInfo('abc123token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      const passwordShare = {
        ...mockShare,
        passwordHash: await bcrypt.hash('secret', 10),
      };
      prisma.fileShare.findUnique.mockResolvedValue(passwordShare);

      await expect(
        service.getShareInfo('abc123token', 'wrong'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should succeed with correct password', async () => {
      const passwordShare = {
        ...mockShare,
        passwordHash: await bcrypt.hash('secret', 10),
      };
      prisma.fileShare.findUnique.mockResolvedValue(passwordShare);

      const result = await service.getShareInfo('abc123token', 'secret');

      expect(result.fileName).toBe('test.pdf');
      expect(result.downloadUrl).toBeDefined();
    });
  });

  describe('downloadShare', () => {
    it('should increment download count and trigger webhook', async () => {
      prisma.fileShare.findUnique.mockResolvedValue(mockShare);
      prisma.fileShare.update.mockResolvedValue(mockShare);

      const result = await service.downloadShare('abc123token');

      expect(result.url).toBe('https://s3.example.com/signed-url');

      expect(prisma.fileShare.update).toHaveBeenCalledWith({
        where: { id: 'share-1' },
        data: { downloadCount: { increment: 1 } },
      });

      expect(webhooks.trigger).toHaveBeenCalledWith(
        'app-1',
        'share.accessed',
        expect.objectContaining({
          shareId: 'share-1',
          downloadCount: 1,
        }),
      );
    });

    it('should throw NotFoundException for invalid token', async () => {
      prisma.fileShare.findUnique.mockResolvedValue(null);

      await expect(service.downloadShare('invalid')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException for expired share', async () => {
      prisma.fileShare.findUnique.mockResolvedValue({
        ...mockShare,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.downloadShare('abc123token')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('revokeShare', () => {
    it('should delete the share', async () => {
      prisma.fileShare.findFirst.mockResolvedValue(mockShare);
      prisma.fileShare.delete.mockResolvedValue(mockShare);

      await service.revokeShare('file-1', 'share-1');

      expect(prisma.fileShare.delete).toHaveBeenCalledWith({
        where: { id: 'share-1' },
      });
    });

    it('should throw NotFoundException for non-existent share', async () => {
      prisma.fileShare.findFirst.mockResolvedValue(null);

      await expect(
        service.revokeShare('file-1', 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listShares', () => {
    it('should return formatted share list', async () => {
      prisma.fileShare.findMany.mockResolvedValue([
        mockShare,
        {
          ...mockShare,
          id: 'share-2',
          token: 'def456token',
          passwordHash: 'somehash',
        },
      ]);

      const result = await service.listShares('file-1');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('share-1');
      expect(result[0].shareUrl).toContain('abc123token');
      expect(result[0].hasPassword).toBe(false);
      expect(result[1].hasPassword).toBe(true);
    });
  });
});
