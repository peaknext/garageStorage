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
  Eye,
  Tag,
  FolderInput,
  Filter,
  X,
  Clock,
  Database,
} from 'lucide-react';
import { FilePreviewModal } from './file-preview-modal';
import { TagPicker } from './tag-picker';
import { MoveToFolderModal } from './move-to-folder-modal';

interface FileTag {
  id: string;
  name: string;
  color: string;
}

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
  thumbnailStatus?: 'NONE' | 'PENDING' | 'GENERATED' | 'FAILED' | 'NOT_APPLICABLE';
  thumbnailUrl?: string | null;
  tags?: FileTag[];
}

export interface FileFilters {
  search: string;
  mimeType: string;
  dateFrom: string;
  dateTo: string;
  sizeMin: string;
  sizeMax: string;
}

interface FileListProps {
  files: FileItem[];
  bucketId: string;
  applicationId?: string;
  isLoading?: boolean;
  onShare?: (file: FileItem) => void;
  filters?: FileFilters;
  onFiltersChange?: (filters: FileFilters) => void;
  totalFiles?: number;
  isInFolder?: boolean;
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

const FILE_TYPE_FILTERS = [
  { value: '', label: 'All Types' },
  { value: 'image/', label: 'Images' },
  { value: 'video/', label: 'Videos' },
  { value: 'audio/', label: 'Audio' },
  { value: 'application/pdf', label: 'PDFs' },
  { value: 'text/', label: 'Text' },
  { value: 'application/', label: 'Documents' },
];

const SIZE_PRESETS = [
  { label: 'Any size', min: '', max: '' },
  { label: '< 100 KB', min: '', max: '102400' },
  { label: '100 KB - 1 MB', min: '102400', max: '1048576' },
  { label: '1 MB - 10 MB', min: '1048576', max: '10485760' },
  { label: '> 10 MB', min: '10485760', max: '' },
];

export function FileList({ files, bucketId, applicationId, isLoading, onShare, filters, onFiltersChange, totalFiles, isInFolder }: FileListProps) {
  const queryClient = useQueryClient();
  const [showFilters, setShowFilters] = useState(false);
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [showSizeFilter, setShowSizeFilter] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);
  const [deleteFileId, setDeleteFileId] = useState<string | null>(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
  const [tagPickerFile, setTagPickerFile] = useState<{ file: FileItem; position: { top: number; left: number } } | null>(null);
  const [showMoveToFolder, setShowMoveToFolder] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Helper to update a single filter
  const updateFilter = (key: keyof FileFilters, value: string) => {
    if (filters && onFiltersChange) {
      onFiltersChange({ ...filters, [key]: value });
    }
  };

  const clearAllFilters = () => {
    if (onFiltersChange) {
      onFiltersChange({
        search: '',
        mimeType: '',
        dateFrom: '',
        dateTo: '',
        sizeMin: '',
        sizeMax: '',
      });
    }
  };

  const hasActiveFilters = filters && (
    filters.search || filters.mimeType || filters.dateFrom ||
    filters.dateTo || filters.sizeMin || filters.sizeMax
  );

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

  const activeFilterLabel = FILE_TYPE_FILTERS.find((f) => f.value === filters?.mimeType)?.label;

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
    if (selectedFiles.size === files.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(files.map((f) => f.id)));
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
      {/* Search and Filters */}
      {!isInFolder && filters && onFiltersChange && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 flex-1 flex-wrap">
              {/* Search Input */}
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#c4bbd3]/60" />
                <Input
                  placeholder="Search files..."
                  value={filters.search}
                  onChange={(e) => updateFilter('search', e.target.value)}
                  className="pl-11"
                />
              </div>

              {/* Type Filter */}
              <div className="relative">
                <Button
                  variant="outline"
                  onClick={() => setShowFilters(!showFilters)}
                  className={filters.mimeType ? 'border-[#ee4f27]/30 text-[#ee4f27]' : ''}
                >
                  <Filter className="mr-2 h-4 w-4" />
                  {activeFilterLabel || 'Type'}
                </Button>
                {showFilters && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowFilters(false)} />
                    <div className="absolute top-full left-0 mt-2 z-20 w-40 rounded-xl bg-[#1a1025] border border-white/[0.1] shadow-xl py-1">
                      {FILE_TYPE_FILTERS.map((filter) => (
                        <button
                          key={filter.value}
                          onClick={() => {
                            updateFilter('mimeType', filter.value);
                            setShowFilters(false);
                          }}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                            filters.mimeType === filter.value
                              ? 'bg-[#ee4f27]/10 text-[#ee4f27]'
                              : 'text-white hover:bg-white/[0.05]'
                          }`}
                        >
                          {filter.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Date Filter */}
              <div className="relative">
                <Button
                  variant="outline"
                  onClick={() => setShowDateFilter(!showDateFilter)}
                  className={(filters.dateFrom || filters.dateTo) ? 'border-[#ee4f27]/30 text-[#ee4f27]' : ''}
                >
                  <Clock className="mr-2 h-4 w-4" />
                  {filters.dateFrom || filters.dateTo ? 'Date set' : 'Date'}
                </Button>
                {showDateFilter && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowDateFilter(false)} />
                    <div className="absolute top-full left-0 mt-2 z-20 w-64 rounded-xl bg-[#1a1025] border border-white/[0.1] shadow-xl p-3 space-y-3">
                      <div>
                        <label className="text-xs text-[#c4bbd3] mb-1 block">From</label>
                        <Input
                          type="date"
                          value={filters.dateFrom}
                          onChange={(e) => updateFilter('dateFrom', e.target.value)}
                          className="h-9"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-[#c4bbd3] mb-1 block">To</label>
                        <Input
                          type="date"
                          value={filters.dateTo}
                          onChange={(e) => updateFilter('dateTo', e.target.value)}
                          className="h-9"
                        />
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full"
                        onClick={() => {
                          updateFilter('dateFrom', '');
                          updateFilter('dateTo', '');
                          setShowDateFilter(false);
                        }}
                      >
                        Clear dates
                      </Button>
                    </div>
                  </>
                )}
              </div>

              {/* Size Filter */}
              <div className="relative">
                <Button
                  variant="outline"
                  onClick={() => setShowSizeFilter(!showSizeFilter)}
                  className={(filters.sizeMin || filters.sizeMax) ? 'border-[#ee4f27]/30 text-[#ee4f27]' : ''}
                >
                  <Database className="mr-2 h-4 w-4" />
                  {(filters.sizeMin || filters.sizeMax) ? 'Size set' : 'Size'}
                </Button>
                {showSizeFilter && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowSizeFilter(false)} />
                    <div className="absolute top-full left-0 mt-2 z-20 w-48 rounded-xl bg-[#1a1025] border border-white/[0.1] shadow-xl py-1">
                      {SIZE_PRESETS.map((preset) => (
                        <button
                          key={preset.label}
                          onClick={() => {
                            onFiltersChange({ ...filters, sizeMin: preset.min, sizeMax: preset.max });
                            setShowSizeFilter(false);
                          }}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                            filters.sizeMin === preset.min && filters.sizeMax === preset.max
                              ? 'bg-[#ee4f27]/10 text-[#ee4f27]'
                              : 'text-white hover:bg-white/[0.05]'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Bulk Actions */}
            {selectedFiles.size > 0 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowMoveToFolder(true)}
                >
                  <FolderInput className="mr-2 h-4 w-4" />
                  Move ({selectedFiles.size})
                </Button>
                <Button
                  variant="outline"
                  onClick={handleBulkDelete}
                  className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete ({selectedFiles.size})
                </Button>
              </div>
            )}
          </div>

          {/* Active Filters / Results Count */}
          <div className="flex items-center gap-3 text-sm">
            <span className="text-[#c4bbd3]">
              {files.length}{totalFiles !== undefined && totalFiles !== files.length ? ` of ${totalFiles}` : ''} files
            </span>
            {hasActiveFilters && (
              <button
                onClick={clearAllFilters}
                className="flex items-center gap-1 text-[#ee4f27] hover:underline"
              >
                <X className="h-3 w-3" />
                Clear filters
              </button>
            )}
          </div>
        </div>
      )}

      {/* File Table */}
      {files.length === 0 ? (
        <div className="py-12 text-center">
          <File className="h-12 w-12 text-[#c4bbd3]/30 mx-auto mb-3" />
          <p className="text-[#c4bbd3]">
            {filters?.search ? 'No files match your search' : 'No files in this bucket'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-white/[0.08] overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[auto_1fr_100px_100px_120px_80px] gap-4 px-4 py-3 bg-white/[0.02] border-b border-white/[0.08] text-sm font-medium text-[#c4bbd3]">
            <div className="flex items-center">
              <button onClick={toggleSelectAll} className="p-1 hover:bg-white/10 rounded">
                {selectedFiles.size === files.length && files.length > 0 ? (
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
          {files.map((file) => {
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
                  {/* Show thumbnail for images, otherwise show icon */}
                  {file.mimeType.startsWith('image/') && file.thumbnailUrl ? (
                    <div className="relative h-10 w-10 flex-shrink-0 rounded-lg overflow-hidden bg-white/[0.05] border border-white/[0.1]">
                      <img
                        src={file.thumbnailUrl}
                        alt={file.originalName}
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          // Hide broken image and show fallback
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </div>
                  ) : (
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-white/[0.03] border border-white/[0.06]">
                      <Icon className={`h-5 w-5 ${iconColor}`} />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{file.originalName}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
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
                      {file.tags && file.tags.length > 0 && (
                        <div className="flex items-center gap-1">
                          {file.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag.id}
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium"
                              style={{
                                backgroundColor: `${tag.color}20`,
                                color: tag.color,
                                border: `1px solid ${tag.color}40`,
                              }}
                            >
                              {tag.name}
                            </span>
                          ))}
                          {file.tags.length > 3 && (
                            <span className="text-[10px] text-[#c4bbd3]/60">
                              +{file.tags.length - 3}
                            </span>
                          )}
                        </div>
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
                            setPreviewFile(file);
                            setOpenDropdown(null);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white hover:bg-white/[0.05]"
                        >
                          <Eye className="h-4 w-4" />
                          Preview
                        </button>
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
                        {applicationId && (
                          <button
                            onClick={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setTagPickerFile({
                                file,
                                position: { top: rect.top, left: rect.left - 264 - 8 },
                              });
                              setOpenDropdown(null);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white hover:bg-white/[0.05]"
                          >
                            <Tag className="h-4 w-4" />
                            Tags
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

      {/* File Preview Modal */}
      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          bucketId={bucketId}
          onClose={() => setPreviewFile(null)}
        />
      )}

      {/* Tag Picker */}
      {tagPickerFile && applicationId && (
        <TagPicker
          fileId={tagPickerFile.file.id}
          bucketId={bucketId}
          applicationId={applicationId}
          position={tagPickerFile.position}
          onClose={() => setTagPickerFile(null)}
        />
      )}

      {/* Move to Folder Modal */}
      {showMoveToFolder && (
        <MoveToFolderModal
          bucketId={bucketId}
          fileIds={Array.from(selectedFiles)}
          onClose={() => setShowMoveToFolder(false)}
          onSuccess={() => setSelectedFiles(new Set())}
        />
      )}
    </div>
  );
}
