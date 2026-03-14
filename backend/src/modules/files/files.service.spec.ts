import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FilesService } from './files.service';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from '../../services/s3/s3.service';
import { CacheService } from '../../services/cache/cache.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { ProcessingService } from '../processing/processing.service';

describe('FilesService', () => {
  let service: FilesService;
  let prisma: any;
  let s3: any;
  let cache: any;
  let webhooks: any;
  let processing: any;
  let eventEmitter: any;

  const mockBucket = {
    id: 'bucket-1',
    name: 'test-bucket',
    applicationId: 'app-1',
    s3BucketId: 'garage-bucket-1',
    application: {
      id: 'app-1',
      storageQuota: BigInt(1073741824), // 1GB
      storageUsed: BigInt(0),
    },
  };

  const mockFile = {
    id: 'file-1',
    bucketId: 'bucket-1',
    key: 'uploads/test-file.pdf',
    originalName: 'test-file.pdf',
    mimeType: 'application/pdf',
    sizeBytes: BigInt(1024),
    checksum: 'abc123',
    etag: '"etag-1"',
    metadata: null,
    isPublic: false,
    downloadCount: 0,
    lastAccessedAt: null,
    thumbnailKey: null,
    thumbnailStatus: 'NONE',
    deletedAt: null,
    deletedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    bucket: mockBucket,
    tags: [],
  };

  beforeEach(async () => {
    prisma = {
      bucket: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      file: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      application: {
        update: jest.fn(),
      },
    };

    s3 = {
      uploadFile: jest.fn().mockResolvedValue({ etag: '"etag-1"' }),
      deleteFile: jest.fn().mockResolvedValue(undefined),
      getPresignedDownloadUrl: jest.fn().mockResolvedValue('https://s3/download'),
      getPresignedUploadUrl: jest.fn().mockResolvedValue('https://s3/upload'),
      downloadFile: jest.fn().mockResolvedValue(Buffer.from('file-content')),
    };

    cache = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    webhooks = {
      trigger: jest.fn().mockResolvedValue(undefined),
    };

    processing = {
      generateThumbnail: jest.fn().mockResolvedValue(undefined),
    };

    eventEmitter = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesService,
        { provide: PrismaService, useValue: prisma },
        { provide: S3Service, useValue: s3 },
        { provide: CacheService, useValue: cache },
        { provide: WebhooksService, useValue: webhooks },
        { provide: ProcessingService, useValue: processing },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<FilesService>(FilesService);
  });

  describe('uploadFile', () => {
    const mockMulterFile = {
      originalname: 'test-file.pdf',
      mimetype: 'application/pdf',
      size: 1024,
      buffer: Buffer.from('fake-file-content'),
    } as Express.Multer.File;

    beforeEach(() => {
      prisma.bucket.findFirst.mockResolvedValue(mockBucket);
      prisma.file.create.mockResolvedValue(mockFile);
      prisma.application.update.mockResolvedValue(mockBucket.application);
      prisma.bucket.update.mockResolvedValue(mockBucket);
    });

    it('should upload a file and return formatted response', async () => {
      const result = await service.uploadFile('app-1', 'bucket-1', mockMulterFile, {});

      expect(s3.uploadFile).toHaveBeenCalledWith(
        'garage-bucket-1',
        expect.any(String), // generated key
        mockMulterFile.buffer,
        'application/pdf',
        undefined,
      );

      expect(prisma.file.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          bucketId: 'bucket-1',
          mimeType: 'application/pdf',
          sizeBytes: BigInt(1024),
        }),
      });

      expect(webhooks.trigger).toHaveBeenCalledWith(
        'app-1',
        'file.uploaded',
        expect.objectContaining({ fileId: 'file-1' }),
      );

      expect(result).toHaveProperty('id');
    });

    it('should reject files larger than 10MB', async () => {
      const largeFile = { ...mockMulterFile, size: 11 * 1024 * 1024 };

      await expect(
        service.uploadFile('app-1', 'bucket-1', largeFile as Express.Multer.File, {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('should queue thumbnail for image files', async () => {
      const imageFile = {
        ...mockMulterFile,
        mimetype: 'image/png',
        originalname: 'photo.png',
      } as Express.Multer.File;

      await service.uploadFile('app-1', 'bucket-1', imageFile, {});

      expect(processing.generateThumbnail).toHaveBeenCalledWith('file-1');
    });

    it('should not queue thumbnail for non-image files', async () => {
      await service.uploadFile('app-1', 'bucket-1', mockMulterFile, {});

      expect(processing.generateThumbnail).not.toHaveBeenCalled();
    });

    it('should use custom key when provided', async () => {
      await service.uploadFile('app-1', 'bucket-1', mockMulterFile, {
        key: 'custom/path/file.pdf',
      });

      expect(s3.uploadFile).toHaveBeenCalledWith(
        'garage-bucket-1',
        'custom/path/file.pdf',
        expect.any(Buffer),
        'application/pdf',
        undefined,
      );
    });
  });

  describe('deleteFile', () => {
    beforeEach(() => {
      prisma.file.findFirst.mockResolvedValue(mockFile);
      prisma.application.update.mockResolvedValue(mockBucket.application);
      prisma.bucket.update.mockResolvedValue(mockBucket);
    });

    it('should soft delete by default', async () => {
      prisma.file.update.mockResolvedValue({ ...mockFile, deletedAt: new Date() });

      await service.deleteFile('app-1', 'bucket-1', 'file-1');

      expect(prisma.file.update).toHaveBeenCalledWith({
        where: { id: 'file-1' },
        data: expect.objectContaining({
          deletedAt: expect.any(Date),
          deletedBy: 'admin',
        }),
      });

      expect(s3.deleteFile).not.toHaveBeenCalled();
      expect(webhooks.trigger).toHaveBeenCalledWith(
        'app-1',
        'file.deleted',
        expect.any(Object),
      );
    });

    it('should permanently delete when permanent=true', async () => {
      prisma.file.delete.mockResolvedValue(mockFile);

      await service.deleteFile('app-1', 'bucket-1', 'file-1', { permanent: true });

      expect(s3.deleteFile).toHaveBeenCalledWith('garage-bucket-1', 'uploads/test-file.pdf');
      expect(prisma.file.delete).toHaveBeenCalledWith({ where: { id: 'file-1' } });
      expect(webhooks.trigger).toHaveBeenCalledWith(
        'app-1',
        'file.purged',
        expect.any(Object),
      );
    });

    it('should delete thumbnail when permanently deleting file with thumbnail', async () => {
      const fileWithThumb = { ...mockFile, thumbnailKey: '_thumbnails/file-1.webp' };
      prisma.file.findFirst.mockResolvedValue(fileWithThumb);
      prisma.file.delete.mockResolvedValue(fileWithThumb);

      await service.deleteFile('app-1', 'bucket-1', 'file-1', { permanent: true });

      expect(s3.deleteFile).toHaveBeenCalledWith('garage-bucket-1', 'uploads/test-file.pdf');
      expect(s3.deleteFile).toHaveBeenCalledWith('garage-bucket-1', '_thumbnails/file-1.webp');
    });

    it('should emit audit log event', async () => {
      prisma.file.update.mockResolvedValue({ ...mockFile, deletedAt: new Date() });

      await service.deleteFile('app-1', 'bucket-1', 'file-1');

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'audit.log',
        expect.objectContaining({
          action: 'FILE_SOFT_DELETED',
          resourceId: 'file-1',
        }),
      );
    });
  });

  describe('listFiles', () => {
    beforeEach(() => {
      prisma.bucket.findFirst.mockResolvedValue(mockBucket);
    });

    it('should return paginated files', async () => {
      prisma.file.findMany.mockResolvedValue([mockFile]);
      prisma.file.count.mockResolvedValue(1);

      const result = await service.listFiles('app-1', 'bucket-1', {});

      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        limit: 50,
        totalPages: 1,
      });
    });

    it('should throw NotFoundException for non-existent bucket', async () => {
      prisma.bucket.findFirst.mockResolvedValue(null);

      await expect(
        service.listFiles('app-1', 'non-existent', {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('should apply search filter to key and originalName', async () => {
      prisma.file.findMany.mockResolvedValue([]);
      prisma.file.count.mockResolvedValue(0);

      await service.listFiles('app-1', 'bucket-1', { prefix: 'test' });

      expect(prisma.file.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { key: { contains: 'test', mode: 'insensitive' } },
              { originalName: { contains: 'test', mode: 'insensitive' } },
            ],
          }),
        }),
      );
    });

    it('should apply mimeType filter', async () => {
      prisma.file.findMany.mockResolvedValue([]);
      prisma.file.count.mockResolvedValue(0);

      await service.listFiles('app-1', 'bucket-1', { mimeType: 'image/' });

      expect(prisma.file.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            mimeType: { startsWith: 'image/' },
          }),
        }),
      );
    });

    it('should apply pagination correctly', async () => {
      prisma.file.findMany.mockResolvedValue([]);
      prisma.file.count.mockResolvedValue(100);

      const result = await service.listFiles('app-1', 'bucket-1', {
        page: 3,
        limit: 20,
      });

      expect(prisma.file.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 40,
          take: 20,
        }),
      );

      expect(result.meta.totalPages).toBe(5);
    });

    it('should exclude soft-deleted files', async () => {
      prisma.file.findMany.mockResolvedValue([]);
      prisma.file.count.mockResolvedValue(0);

      await service.listFiles('app-1', 'bucket-1', {});

      expect(prisma.file.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
          }),
        }),
      );
    });
  });

  describe('updateFile', () => {
    beforeEach(() => {
      prisma.file.findFirst.mockResolvedValue(mockFile);
    });

    it('should update file name and emit audit event', async () => {
      prisma.file.update.mockResolvedValue({
        ...mockFile,
        originalName: 'renamed.pdf',
        updatedAt: new Date(),
      });

      const result = await service.updateFile('app-1', 'bucket-1', 'file-1', {
        originalName: 'renamed.pdf',
      });

      expect(result.originalName).toBe('renamed.pdf');
      expect(prisma.file.update).toHaveBeenCalledWith({
        where: { id: 'file-1' },
        data: { originalName: 'renamed.pdf' },
      });

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'audit.log',
        expect.objectContaining({
          action: 'FILE_RENAMED',
          previousValue: { originalName: 'test-file.pdf' },
          newValue: { originalName: 'renamed.pdf' },
        }),
      );
    });

    it('should update isPublic flag', async () => {
      prisma.file.update.mockResolvedValue({
        ...mockFile,
        isPublic: true,
        updatedAt: new Date(),
      });

      await service.updateFile('app-1', 'bucket-1', 'file-1', {
        isPublic: true,
      });

      expect(prisma.file.update).toHaveBeenCalledWith({
        where: { id: 'file-1' },
        data: { isPublic: true },
      });
    });
  });

  describe('streamZipDownload', () => {
    it('should throw BadRequestException for empty fileIds', async () => {
      await expect(
        service.streamZipDownload('app-1', 'bucket-1', [], {} as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for more than 100 files', async () => {
      const ids = Array.from({ length: 101 }, (_, i) => `file-${i}`);

      await expect(
        service.streamZipDownload('app-1', 'bucket-1', ids, {} as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for non-existent bucket', async () => {
      prisma.bucket.findFirst.mockResolvedValue(null);

      await expect(
        service.streamZipDownload('app-1', 'bucket-1', ['file-1'], {} as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('bulkDelete', () => {
    it('should delete multiple files and report results', async () => {
      prisma.bucket.findFirst.mockResolvedValue(mockBucket);
      prisma.file.findFirst.mockResolvedValue(mockFile);
      prisma.file.update.mockResolvedValue({ ...mockFile, deletedAt: new Date() });
      prisma.application.update.mockResolvedValue(mockBucket.application);
      prisma.bucket.update.mockResolvedValue(mockBucket);

      const result = await service.bulkDelete('app-1', 'bucket-1', ['file-1', 'file-2']);

      expect(result.deleted).toBe(2);
      expect(result.failed).toEqual([]);
    });

    it('should throw NotFoundException for non-existent bucket', async () => {
      prisma.bucket.findFirst.mockResolvedValue(null);

      await expect(
        service.bulkDelete('app-1', 'non-existent', ['file-1']),
      ).rejects.toThrow(NotFoundException);
    });

    it('should report failed deletions', async () => {
      prisma.bucket.findFirst.mockResolvedValue(mockBucket);
      prisma.file.findFirst
        .mockResolvedValueOnce(mockFile)
        .mockResolvedValueOnce(null); // Second file not found
      prisma.file.update.mockResolvedValue({ ...mockFile, deletedAt: new Date() });
      prisma.application.update.mockResolvedValue(mockBucket.application);
      prisma.bucket.update.mockResolvedValue(mockBucket);

      const result = await service.bulkDelete('app-1', 'bucket-1', ['file-1', 'non-existent']);

      expect(result.deleted).toBe(1);
      expect(result.failed).toEqual(['non-existent']);
    });
  });
});
