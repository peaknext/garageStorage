import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from '../../services/s3/s3.service';
import { CreateShareDto } from './dto/create-share.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class SharesService {
  constructor(
    private prisma: PrismaService,
    private s3: S3Service,
  ) {}

  async createShare(fileId: string, dto: CreateShareDto) {
    const file = await this.prisma.file.findUnique({
      where: { id: fileId },
      include: { bucket: true },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    const data: any = {
      fileId,
      allowPreview: dto.allowPreview !== false,
    };

    if (dto.expiresIn) {
      data.expiresAt = new Date(Date.now() + dto.expiresIn * 1000);
    }

    if (dto.maxDownloads) {
      data.maxDownloads = dto.maxDownloads;
    }

    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 10);
    }

    const share = await this.prisma.fileShare.create({ data });

    const baseUrl = process.env.API_BASE_URL || 'http://localhost:4001';
    const shareUrl = `${baseUrl}/api/v1/shares/${share.token}/download`;

    return {
      id: share.id,
      token: share.token,
      shareUrl,
      expiresAt: share.expiresAt,
      maxDownloads: share.maxDownloads,
      createdAt: share.createdAt,
    };
  }

  async getShareInfo(token: string, password?: string) {
    const share = await this.prisma.fileShare.findUnique({
      where: { token },
      include: {
        file: {
          include: { bucket: true },
        },
      },
    });

    if (!share) {
      throw new NotFoundException('Share not found');
    }

    // Check expiration
    if (share.expiresAt && share.expiresAt < new Date()) {
      throw new ForbiddenException('Share link has expired');
    }

    // Check download limit
    if (share.maxDownloads && share.downloadCount >= share.maxDownloads) {
      throw new ForbiddenException('Download limit reached');
    }

    // Check password
    if (share.passwordHash) {
      if (!password) {
        throw new UnauthorizedException('Password required');
      }
      const isValid = await bcrypt.compare(password, share.passwordHash);
      if (!isValid) {
        throw new UnauthorizedException('Invalid password');
      }
    }

    // Generate download URL
    const downloadUrl = await this.s3.getPresignedDownloadUrl(
      share.file.bucket.garageBucketId,
      share.file.key,
      3600,
      share.file.originalName,
    );

    return {
      fileName: share.file.originalName,
      mimeType: share.file.mimeType,
      sizeBytes: Number(share.file.sizeBytes),
      allowPreview: share.allowPreview,
      downloadUrl,
    };
  }

  async downloadShare(token: string, password?: string) {
    const share = await this.prisma.fileShare.findUnique({
      where: { token },
      include: {
        file: {
          include: { bucket: true },
        },
      },
    });

    if (!share) {
      throw new NotFoundException('Share not found');
    }

    // Check expiration
    if (share.expiresAt && share.expiresAt < new Date()) {
      throw new ForbiddenException('Share link has expired');
    }

    // Check download limit
    if (share.maxDownloads && share.downloadCount >= share.maxDownloads) {
      throw new ForbiddenException('Download limit reached');
    }

    // Check password
    if (share.passwordHash) {
      if (!password) {
        throw new UnauthorizedException('Password required');
      }
      const isValid = await bcrypt.compare(password, share.passwordHash);
      if (!isValid) {
        throw new UnauthorizedException('Invalid password');
      }
    }

    // Increment download count
    await this.prisma.fileShare.update({
      where: { id: share.id },
      data: { downloadCount: { increment: 1 } },
    });

    // Generate download URL
    const url = await this.s3.getPresignedDownloadUrl(
      share.file.bucket.garageBucketId,
      share.file.key,
      300,
      share.file.originalName,
    );

    return { url };
  }

  async revokeShare(fileId: string, shareId: string) {
    const share = await this.prisma.fileShare.findFirst({
      where: { id: shareId, fileId },
    });

    if (!share) {
      throw new NotFoundException('Share not found');
    }

    await this.prisma.fileShare.delete({ where: { id: shareId } });
  }

  async listShares(fileId: string) {
    const shares = await this.prisma.fileShare.findMany({
      where: { fileId },
      orderBy: { createdAt: 'desc' },
    });

    const baseUrl = process.env.API_BASE_URL || 'http://localhost:4001';

    return shares.map((share) => ({
      id: share.id,
      token: share.token,
      shareUrl: `${baseUrl}/api/v1/shares/${share.token}/download`,
      expiresAt: share.expiresAt,
      maxDownloads: share.maxDownloads,
      downloadCount: share.downloadCount,
      hasPassword: !!share.passwordHash,
      allowPreview: share.allowPreview,
      createdAt: share.createdAt,
    }));
  }
}
