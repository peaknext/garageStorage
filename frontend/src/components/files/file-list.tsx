'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { apiClient } from '@/lib/api-client';
import { formatBytes, formatDate } from '@/lib/utils';
import {
  File,
  FileImage,
  FileVideo,
  FileAudio,
  FileText,
  FileCode,
  FileArchive,
  Trash2,
  Download,
  Share2,
  MoreVertical,
  Search,
  Globe,
  Lock,
  CheckSquare,
  Square,
} from 'lucide-react';

interface FileItem {
  id: string;
  key: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  isPublic: boolean;
  downloadCount: number;
  createdAt: string;
  url: string;
}

interface FileListProps {
  files: FileItem[];
  bucketId: string;
  isLoading?: boolean;
  onShare?: (file: FileItem) => void;
}

const getFileIcon = (mimeType: string) => {
  if (mimeType.startsWith('image/')) return FileImage;
  if (mimeType.startsWith('video/')) return FileVideo;
  if (mimeType.startsWith('audio/')) return FileAudio;
  if (mimeType.startsWith('text/')) return FileText;
  if (mimeType.includes('json') || mimeType.includes('javascript') || mimeType.includes('xml'))
    return FileCode;
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('tar'))
    return FileArchive;
  return File;
};

const getFileIconColor = (mimeType: string) => {
  if (mimeType.startsWith('image/')) return 'text-pink-400';
  if (mimeType.startsWith('video/')) return 'text-purple-400';
  if (mimeType.startsWith('audio/')) return 'text-blue-400';
  if (mimeType.startsWith('text/')) return 'text-emerald-400';
  if (mimeType.includes('json') || mimeType.includes('javascript')) return 'text-yellow-400';
  if (mimeType.includes('pdf')) return 'text-red-400';
  return 'text-[#c4bbd3]';
};

export function FileList({ files, bucketId, isLoading, onShare }: FileListProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);
  const [deleteFileId, setDeleteFileId] = useState<string | null>(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const deleteMutation = useMutation({
    mutationFn: async (fileId: string) => {
      await apiClient.delete(`/admin/buckets/${bucketId}/files/${fileId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bucket-files', bucketId] });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (fileIds: string[]) => {
      await apiClient.post(`/admin/buckets/${bucketId}/files/bulk-delete`, { fileIds });
    },
    onSuccess: () => {
      setSelectedFiles(new Set());
      queryClient.invalidateQueries({ queryKey: ['bucket-files', bucketId] });
    },
  });

  const filteredFiles = files.filter((file) =>
    file.originalName.toLowerCase().includes(search.toLowerCase())
  );

  const toggleSelect = (fileId: string) => {
    const newSelected = new Set(selectedFiles);
    if (newSelected.has(fileId)) {
      newSelected.delete(fileId);
    } else {
      newSelected.add(fileId);
    }
    setSelectedFiles(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedFiles.size === filteredFiles.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(filteredFiles.map((f) => f.id)));
    }
  };

  const handleDownload = async (file: FileItem) => {
    try {
      const { data } = await apiClient.get<{ url: string }>(`/admin/buckets/${bucketId}/files/${file.id}/download`);
      window.open(data.url, '_blank');
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  const handleDelete = (fileId: string) => {
    setDeleteFileId(fileId);
  };

  const handleBulkDelete = () => {
    if (selectedFiles.size === 0) return;
    setShowBulkDeleteConfirm(true);
  };

  const confirmDelete = () => {
    if (deleteFileId) {
      deleteMutation.mutate(deleteFileId);
      setDeleteFileId(null);
    }
  };

  const confirmBulkDelete = () => {
    bulkDeleteMutation.mutate(Array.from(selectedFiles));
    setShowBulkDeleteConfirm(false);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="relative">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#ee4f27]/30 border-t-[#ee4f27]" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search and Actions */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#c4bbd3]/60" />
          <Input
            placeholder="Search files..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-11"
          />
        </div>
        {selectedFiles.size > 0 && (
          <Button
            variant="outline"
            onClick={handleBulkDelete}
            className="border-red-500/30 text-red-400 hover:bg-red-500/10"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete ({selectedFiles.size})
          </Button>
        )}
      </div>

      {/* File Table */}
      {filteredFiles.length === 0 ? (
        <div className="py-12 text-center">
          <File className="h-12 w-12 text-[#c4bbd3]/30 mx-auto mb-3" />
          <p className="text-[#c4bbd3]">
            {search ? 'No files match your search' : 'No files in this bucket'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-white/[0.08] overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[auto_1fr_100px_100px_120px_80px] gap-4 px-4 py-3 bg-white/[0.02] border-b border-white/[0.08] text-sm font-medium text-[#c4bbd3]">
            <div className="flex items-center">
              <button onClick={toggleSelectAll} className="p-1 hover:bg-white/10 rounded">
                {selectedFiles.size === filteredFiles.length && filteredFiles.length > 0 ? (
                  <CheckSquare className="h-4 w-4 text-[#ee4f27]" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
              </button>
            </div>
            <div>Name</div>
            <div>Size</div>
            <div>Type</div>
            <div>Created</div>
            <div></div>
          </div>

          {/* Rows */}
          {filteredFiles.map((file) => {
            const Icon = getFileIcon(file.mimeType);
            const iconColor = getFileIconColor(file.mimeType);

            return (
              <div
                key={file.id}
                className="grid grid-cols-[auto_1fr_100px_100px_120px_80px] gap-4 px-4 py-3 border-b border-white/[0.06] hover:bg-white/[0.02] transition-colors items-center"
              >
                <div className="flex items-center">
                  <button
                    onClick={() => toggleSelect(file.id)}
                    className="p-1 hover:bg-white/10 rounded"
                  >
                    {selectedFiles.has(file.id) ? (
                      <CheckSquare className="h-4 w-4 text-[#ee4f27]" />
                    ) : (
                      <Square className="h-4 w-4 text-[#c4bbd3]" />
                    )}
                  </button>
                </div>

                <div className="flex items-center gap-3 min-w-0">
                  <Icon className={`h-5 w-5 flex-shrink-0 ${iconColor}`} />
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{file.originalName}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {file.isPublic ? (
                        <span className="flex items-center gap-1 text-xs text-emerald-400">
                          <Globe className="h-3 w-3" />
                          Public
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-[#c4bbd3]/60">
                          <Lock className="h-3 w-3" />
                          Private
                        </span>
                      )}
                      {file.downloadCount > 0 && (
                        <span className="text-xs text-[#c4bbd3]/60">
                          {file.downloadCount} downloads
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-sm text-[#c4bbd3]">{formatBytes(file.sizeBytes)}</div>

                <div className="text-sm text-[#c4bbd3]/70 truncate">
                  {file.mimeType.split('/')[1] || file.mimeType}
                </div>

                <div className="text-sm text-[#c4bbd3]/70">{formatDate(file.createdAt)}</div>

                <div className="relative dropdown-container">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={(e) => {
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      const menuWidth = 160; // w-40 = 10rem = 160px
                      const menuHeight = 120; // Approximate menu height
                      const padding = 8;

                      // Calculate initial position (below button, right-aligned)
                      let top = rect.bottom + 4;
                      let left = rect.right - menuWidth;

                      // Adjust if menu would go below viewport
                      if (top + menuHeight > window.innerHeight - padding) {
                        top = rect.top - menuHeight - 4;
                      }

                      // Adjust if menu would go past left edge
                      if (left < padding) {
                        left = padding;
                      }

                      // Adjust if menu would go past right edge
                      if (left + menuWidth > window.innerWidth - padding) {
                        left = window.innerWidth - menuWidth - padding;
                      }

                      setDropdownPosition({ top, left });
                      setOpenDropdown(openDropdown === file.id ? null : file.id);
                    }}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>

                  {openDropdown === file.id && mounted && createPortal(
                    <>
                      <div
                        className="fixed inset-0 z-[9998]"
                        onClick={() => setOpenDropdown(null)}
                      />
                      <div
                        className="fixed z-[9999] w-40 rounded-xl bg-[#1a1025] border border-white/[0.1] shadow-xl py-1"
                        style={{ top: `${dropdownPosition.top}px`, left: `${dropdownPosition.left}px` }}
                      >
                        <button
                          onClick={() => {
                            handleDownload(file);
                            setOpenDropdown(null);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white hover:bg-white/[0.05]"
                        >
                          <Download className="h-4 w-4" />
                          Download
                        </button>
                        {onShare && (
                          <button
                            onClick={() => {
                              onShare(file);
                              setOpenDropdown(null);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white hover:bg-white/[0.05]"
                          >
                            <Share2 className="h-4 w-4" />
                            Share
                          </button>
                        )}
                        <button
                          onClick={() => {
                            handleDelete(file.id);
                            setOpenDropdown(null);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10"
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </button>
                      </div>
                    </>,
                    document.body
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deleteFileId}
        onOpenChange={(open) => !open && setDeleteFileId(null)}
        title="Delete file?"
        description="This action cannot be undone. The file will be permanently deleted."
        variant="destructive"
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        loading={deleteMutation.isPending}
      />

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog
        open={showBulkDeleteConfirm}
        onOpenChange={setShowBulkDeleteConfirm}
        title={`Delete ${selectedFiles.size} file(s)?`}
        description="This action cannot be undone. All selected files will be permanently deleted."
        variant="destructive"
        confirmLabel="Delete All"
        onConfirm={confirmBulkDelete}
        loading={bulkDeleteMutation.isPending}
      />
    </div>
  );
}
