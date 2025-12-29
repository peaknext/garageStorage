import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface CreateFolderDto {
  name: string;
  parentId?: string;
}

@Injectable()
export class FoldersService {
  private readonly logger = new Logger(FoldersService.name);

  constructor(private prisma: PrismaService) {}

  async findAllByBucket(bucketId: string) {
    const folders = await this.prisma.virtualFolder.findMany({
      where: { bucketId },
      orderBy: { path: 'asc' },
      include: {
        _count: { select: { files: true, children: true } },
      },
    });

    return this.buildFolderTree(folders);
  }

  private buildFolderTree(folders: any[]) {
    const map = new Map<string, any>();
    const roots: any[] = [];

    // Create a map of all folders
    folders.forEach((folder) => {
      map.set(folder.id, { ...folder, children: [] });
    });

    // Build tree structure
    folders.forEach((folder) => {
      const node = map.get(folder.id);
      if (folder.parentId && map.has(folder.parentId)) {
        map.get(folder.parentId).children.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  }

  async create(bucketId: string, dto: CreateFolderDto) {
    let parentPath = '/';

    if (dto.parentId) {
      const parent = await this.prisma.virtualFolder.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent || parent.bucketId !== bucketId) {
        throw new NotFoundException('Parent folder not found');
      }
      parentPath = parent.path;
    }

    const path = `${parentPath}${dto.name}/`;

    // Check for duplicate path
    const existing = await this.prisma.virtualFolder.findUnique({
      where: { bucketId_path: { bucketId, path } },
    });

    if (existing) {
      throw new ConflictException(`Folder "${dto.name}" already exists at this location`);
    }

    return this.prisma.virtualFolder.create({
      data: {
        bucketId,
        name: dto.name,
        parentId: dto.parentId,
        path,
      },
      include: {
        _count: { select: { files: true, children: true } },
      },
    });
  }

  async update(id: string, dto: { name?: string; parentId?: string }) {
    const folder = await this.prisma.virtualFolder.findUnique({
      where: { id },
      include: { children: true },
    });

    if (!folder) {
      throw new NotFoundException('Folder not found');
    }

    let newPath = folder.path;
    let newParentId = folder.parentId;

    // Handle rename
    if (dto.name && dto.name !== folder.name) {
      const parentPath = folder.path.substring(0, folder.path.lastIndexOf(folder.name + '/'));
      newPath = `${parentPath}${dto.name}/`;

      // Check for conflicts
      const existing = await this.prisma.virtualFolder.findUnique({
        where: { bucketId_path: { bucketId: folder.bucketId, path: newPath } },
      });
      if (existing) {
        throw new ConflictException(`Folder "${dto.name}" already exists at this location`);
      }
    }

    // Handle move
    if (dto.parentId !== undefined && dto.parentId !== folder.parentId) {
      if (dto.parentId === id) {
        throw new ConflictException('Cannot move folder into itself');
      }

      let parentPath = '/';
      if (dto.parentId) {
        const newParent = await this.prisma.virtualFolder.findUnique({
          where: { id: dto.parentId },
        });
        if (!newParent || newParent.bucketId !== folder.bucketId) {
          throw new NotFoundException('New parent folder not found');
        }
        // Check if new parent is a descendant of this folder
        if (newParent.path.startsWith(folder.path)) {
          throw new ConflictException('Cannot move folder into its own descendant');
        }
        parentPath = newParent.path;
      }

      newParentId = dto.parentId || null;
      newPath = `${parentPath}${dto.name || folder.name}/`;
    }

    // Update this folder
    const updatedFolder = await this.prisma.virtualFolder.update({
      where: { id },
      data: {
        name: dto.name || folder.name,
        parentId: newParentId,
        path: newPath,
      },
    });

    // Update all descendant paths if path changed
    if (newPath !== folder.path) {
      await this.updateDescendantPaths(folder.bucketId, folder.path, newPath);
    }

    return updatedFolder;
  }

  private async updateDescendantPaths(bucketId: string, oldPath: string, newPath: string) {
    const descendants = await this.prisma.virtualFolder.findMany({
      where: {
        bucketId,
        path: { startsWith: oldPath },
        NOT: { path: oldPath },
      },
    });

    for (const desc of descendants) {
      const updatedPath = desc.path.replace(oldPath, newPath);
      await this.prisma.virtualFolder.update({
        where: { id: desc.id },
        data: { path: updatedPath },
      });
    }
  }

  async delete(id: string) {
    const folder = await this.prisma.virtualFolder.findUnique({
      where: { id },
      include: { _count: { select: { children: true, files: true } } },
    });

    if (!folder) {
      throw new NotFoundException('Folder not found');
    }

    // Delete will cascade to children and file associations
    await this.prisma.virtualFolder.delete({ where: { id } });
  }

  async addFileToFolder(fileId: string, folderId: string) {
    const [file, folder] = await Promise.all([
      this.prisma.file.findUnique({ where: { id: fileId } }),
      this.prisma.virtualFolder.findUnique({ where: { id: folderId } }),
    ]);

    if (!file) {
      throw new NotFoundException('File not found');
    }
    if (!folder) {
      throw new NotFoundException('Folder not found');
    }
    if (file.bucketId !== folder.bucketId) {
      throw new ConflictException('File and folder must be in the same bucket');
    }

    await this.prisma.fileFolder.upsert({
      where: { fileId_folderId: { fileId, folderId } },
      create: { fileId, folderId },
      update: {},
    });

    return { message: 'File added to folder' };
  }

  async removeFileFromFolder(fileId: string, folderId: string) {
    await this.prisma.fileFolder.delete({
      where: { fileId_folderId: { fileId, folderId } },
    });
  }

  async getFilesInFolder(folderId: string, page = 1, limit = 50) {
    const [fileFolders, total] = await Promise.all([
      this.prisma.fileFolder.findMany({
        where: { folderId },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          file: {
            include: {
              tags: {
                include: {
                  tag: true,
                },
              },
            },
          },
        },
        orderBy: { file: { createdAt: 'desc' } },
      }),
      this.prisma.fileFolder.count({ where: { folderId } }),
    ]);

    // Format files to match the main files list structure
    const formattedFiles = fileFolders.map((ff) => {
      const file = ff.file;
      const tags = (file as any).tags?.map((ft: any) => ({
        id: ft.tag.id,
        name: ft.tag.name,
        color: ft.tag.color,
      })) || [];

      return {
        id: file.id,
        key: file.key,
        originalName: file.originalName,
        mimeType: file.mimeType,
        sizeBytes: Number(file.sizeBytes),
        isPublic: file.isPublic,
        downloadCount: file.downloadCount,
        createdAt: file.createdAt,
        thumbnailStatus: file.thumbnailStatus,
        thumbnailKey: file.thumbnailKey,
        imageWidth: file.imageWidth,
        imageHeight: file.imageHeight,
        tags,
      };
    });

    return {
      data: formattedFiles,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getFolderBreadcrumb(folderId: string) {
    const folder = await this.prisma.virtualFolder.findUnique({
      where: { id: folderId },
    });

    if (!folder) {
      throw new NotFoundException('Folder not found');
    }

    // Get all ancestor folders based on path
    const pathParts = folder.path.split('/').filter(Boolean);
    const breadcrumb: any[] = [];

    let currentPath = '/';
    for (const part of pathParts) {
      currentPath += part + '/';
      const ancestor = await this.prisma.virtualFolder.findUnique({
        where: { bucketId_path: { bucketId: folder.bucketId, path: currentPath } },
        select: { id: true, name: true, path: true },
      });
      if (ancestor) {
        breadcrumb.push(ancestor);
      }
    }

    return breadcrumb;
  }

  // External API methods with app validation

  private async validateBucketOwnership(appId: string, bucketId: string) {
    const bucket = await this.prisma.bucket.findUnique({
      where: { id: bucketId },
      select: { applicationId: true },
    });
    if (!bucket) {
      throw new NotFoundException('Bucket not found');
    }
    if (bucket.applicationId !== appId) {
      throw new NotFoundException('Bucket not found');
    }
  }

  private async validateFolderOwnership(appId: string, folderId: string) {
    const folder = await this.prisma.virtualFolder.findUnique({
      where: { id: folderId },
      include: { bucket: { select: { applicationId: true } } },
    });
    if (!folder) {
      throw new NotFoundException('Folder not found');
    }
    if (folder.bucket.applicationId !== appId) {
      throw new NotFoundException('Folder not found');
    }
    return folder;
  }

  async findAllByBucketWithAppValidation(appId: string, bucketId: string) {
    await this.validateBucketOwnership(appId, bucketId);
    return this.findAllByBucket(bucketId);
  }

  async createWithAppValidation(appId: string, bucketId: string, dto: CreateFolderDto) {
    await this.validateBucketOwnership(appId, bucketId);
    return this.create(bucketId, dto);
  }

  async updateWithAppValidation(appId: string, id: string, dto: { name?: string; parentId?: string }) {
    await this.validateFolderOwnership(appId, id);
    return this.update(id, dto);
  }

  async deleteWithAppValidation(appId: string, id: string) {
    await this.validateFolderOwnership(appId, id);
    return this.delete(id);
  }

  async getFilesInFolderWithAppValidation(appId: string, folderId: string, page = 1, limit = 50) {
    await this.validateFolderOwnership(appId, folderId);
    return this.getFilesInFolder(folderId, page, limit);
  }

  async getFolderBreadcrumbWithAppValidation(appId: string, folderId: string) {
    await this.validateFolderOwnership(appId, folderId);
    return this.getFolderBreadcrumb(folderId);
  }

  async addFileToFolderWithAppValidation(appId: string, fileId: string, folderId: string) {
    // Validate file belongs to app
    const file = await this.prisma.file.findUnique({
      where: { id: fileId },
      include: { bucket: { select: { applicationId: true } } },
    });
    if (!file) {
      throw new NotFoundException('File not found');
    }
    if (file.bucket.applicationId !== appId) {
      throw new NotFoundException('File not found');
    }

    // Validate folder belongs to app
    await this.validateFolderOwnership(appId, folderId);

    return this.addFileToFolder(fileId, folderId);
  }

  async removeFileFromFolderWithAppValidation(appId: string, fileId: string, folderId: string) {
    // Validate file belongs to app
    const file = await this.prisma.file.findUnique({
      where: { id: fileId },
      include: { bucket: { select: { applicationId: true } } },
    });
    if (!file) {
      throw new NotFoundException('File not found');
    }
    if (file.bucket.applicationId !== appId) {
      throw new NotFoundException('File not found');
    }

    return this.removeFileFromFolder(fileId, folderId);
  }
}
