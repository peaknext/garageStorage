import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface CreateTagDto {
  name: string;
  color?: string;
}

@Injectable()
export class TagsService {
  private readonly logger = new Logger(TagsService.name);

  constructor(private prisma: PrismaService) {}

  async findAllByApplication(applicationId: string) {
    return this.prisma.tag.findMany({
      where: { applicationId },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { files: true } },
      },
    });
  }

  async create(applicationId: string, dto: CreateTagDto) {
    // Check if tag with same name already exists
    const existing = await this.prisma.tag.findUnique({
      where: { applicationId_name: { applicationId, name: dto.name } },
    });

    if (existing) {
      throw new ConflictException(`Tag "${dto.name}" already exists`);
    }

    return this.prisma.tag.create({
      data: {
        applicationId,
        name: dto.name,
        color: dto.color,
      },
    });
  }

  async update(id: string, dto: Partial<CreateTagDto>) {
    const tag = await this.prisma.tag.findUnique({ where: { id } });
    if (!tag) {
      throw new NotFoundException('Tag not found');
    }

    // Check name uniqueness if changing name
    if (dto.name && dto.name !== tag.name) {
      const existing = await this.prisma.tag.findUnique({
        where: { applicationId_name: { applicationId: tag.applicationId, name: dto.name } },
      });
      if (existing) {
        throw new ConflictException(`Tag "${dto.name}" already exists`);
      }
    }

    return this.prisma.tag.update({
      where: { id },
      data: dto,
    });
  }

  async delete(id: string) {
    const tag = await this.prisma.tag.findUnique({ where: { id } });
    if (!tag) {
      throw new NotFoundException('Tag not found');
    }

    await this.prisma.tag.delete({ where: { id } });
  }

  async addTagsToFile(fileId: string, tagIds: string[]) {
    const file = await this.prisma.file.findUnique({
      where: { id: fileId },
      include: { bucket: true },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    // Verify all tags belong to the same application
    const tags = await this.prisma.tag.findMany({
      where: {
        id: { in: tagIds },
        applicationId: file.bucket.applicationId,
      },
    });

    if (tags.length !== tagIds.length) {
      throw new NotFoundException('One or more tags not found or not in same application');
    }

    // Add tags (ignore duplicates)
    await this.prisma.fileTag.createMany({
      data: tagIds.map((tagId) => ({ fileId, tagId })),
      skipDuplicates: true,
    });

    return this.getFileTags(fileId);
  }

  async removeTagFromFile(fileId: string, tagId: string) {
    await this.prisma.fileTag.delete({
      where: { fileId_tagId: { fileId, tagId } },
    });
  }

  async getFileTags(fileId: string) {
    const fileTags = await this.prisma.fileTag.findMany({
      where: { fileId },
      include: { tag: true },
    });

    return fileTags.map((ft) => ft.tag);
  }

  async getFilesByTag(tagId: string, page = 1, limit = 50) {
    const [fileTags, total] = await Promise.all([
      this.prisma.fileTag.findMany({
        where: { tagId },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          file: {
            include: { bucket: { select: { id: true, name: true } } },
          },
        },
      }),
      this.prisma.fileTag.count({ where: { tagId } }),
    ]);

    return {
      data: fileTags.map((ft) => ft.file),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
