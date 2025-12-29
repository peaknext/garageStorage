'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Trash2,
  RotateCcw,
  AlertTriangle,
  Loader2,
  RefreshCw,
  HardDrive,
  Clock,
  FileIcon,
  ChevronDown,
  Check,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface DeletedFile {
  id: string;
  key: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  deletedAt: string;
  deletedBy: string;
  daysRemaining: number;
  bucket: {
    id: string;
    name: string;
  };
  application: {
    id: string;
    name: string;
  };
  tags?: { id: string; name: string; color: string | null }[];
  createdAt: string;
}

interface RecycleBinStats {
  totalFiles: number;
  totalBytes: number;
  oldestFile: {
    name: string;
    deletedAt: string;
    daysRemaining: number;
  } | null;
}

interface Application {
  id: string;
  name: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default function RecycleBinPage() {
  const queryClient = useQueryClient();
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [showEmptyDialog, setShowEmptyDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [selectedAppId, setSelectedAppId] = useState<string>('');
  const [appDropdownOpen, setAppDropdownOpen] = useState(false);

  // Fetch applications for filter
  const { data: applicationsData } = useQuery({
    queryKey: ['applications'],
    queryFn: () => apiClient.get<{ data: Application[] }>('/admin/applications'),
  });

  const applications = applicationsData?.data?.data || [];

  // Fetch recycle bin stats
  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['recycle-bin-stats', selectedAppId],
    queryFn: () =>
      apiClient.get<RecycleBinStats>(
        `/admin/recycle-bin/stats${selectedAppId ? `?applicationId=${selectedAppId}` : ''}`
      ),
  });

  const stats = statsData?.data;

  // Fetch deleted files
  const {
    data: filesData,
    isLoading: filesLoading,
    refetch: refetchFiles,
  } = useQuery({
    queryKey: ['recycle-bin-files', selectedAppId],
    queryFn: () =>
      apiClient.get<{ data: DeletedFile[]; meta: { total: number } }>(
        `/admin/recycle-bin?${selectedAppId ? `applicationId=${selectedAppId}&` : ''}limit=100`
      ),
  });

  const deletedFiles = filesData?.data?.data || [];

  // Restore mutation
  const restoreMutation = useMutation({
    mutationFn: (fileId: string) =>
      apiClient.post(`/admin/recycle-bin/${fileId}/restore`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recycle-bin-files'] });
      queryClient.invalidateQueries({ queryKey: ['recycle-bin-stats'] });
      setSelectedFiles(new Set());
    },
  });

  // Permanent delete mutation
  const deleteMutation = useMutation({
    mutationFn: (fileId: string) =>
      apiClient.delete(`/admin/recycle-bin/${fileId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recycle-bin-files'] });
      queryClient.invalidateQueries({ queryKey: ['recycle-bin-stats'] });
      setSelectedFiles(new Set());
    },
  });

  // Empty recycle bin mutation
  const emptyMutation = useMutation({
    mutationFn: () =>
      apiClient.post(
        `/admin/recycle-bin/purge${selectedAppId ? `?applicationId=${selectedAppId}` : ''}`
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recycle-bin-files'] });
      queryClient.invalidateQueries({ queryKey: ['recycle-bin-stats'] });
      setSelectedFiles(new Set());
      setShowEmptyDialog(false);
    },
  });

  // Handle bulk restore
  const handleBulkRestore = async () => {
    for (const fileId of selectedFiles) {
      await restoreMutation.mutateAsync(fileId);
    }
    setShowRestoreDialog(false);
  };

  // Handle bulk delete
  const handleBulkDelete = async () => {
    for (const fileId of selectedFiles) {
      await deleteMutation.mutateAsync(fileId);
    }
    setShowDeleteDialog(false);
  };

  // Toggle file selection
  const toggleFileSelection = (fileId: string) => {
    const newSelected = new Set(selectedFiles);
    if (newSelected.has(fileId)) {
      newSelected.delete(fileId);
    } else {
      newSelected.add(fileId);
    }
    setSelectedFiles(newSelected);
  };

  // Select all files
  const selectAllFiles = () => {
    if (selectedFiles.size === deletedFiles.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(deletedFiles.map((f) => f.id)));
    }
  };

  // Calculate selected size
  const selectedSize = useMemo(() => {
    return deletedFiles
      .filter((f) => selectedFiles.has(f.id))
      .reduce((acc, f) => acc + f.sizeBytes, 0);
  }, [deletedFiles, selectedFiles]);

  const isLoading = statsLoading || filesLoading;
  const isMutating = restoreMutation.isPending || deleteMutation.isPending || emptyMutation.isPending;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Trash2 className="w-6 h-6 text-red-400" />
            Recycle Bin
          </h1>
          <p className="text-gray-400 mt-1">
            Deleted files are kept for 30 days before automatic permanent deletion
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchFiles()}
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {deletedFiles.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowEmptyDialog(true)}
              disabled={isMutating}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Empty Recycle Bin
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-[#1a1025] border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-500/20 rounded-lg">
              <FileIcon className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Deleted Files</p>
              <p className="text-xl font-bold text-white">
                {statsLoading ? '...' : stats?.totalFiles || 0}
              </p>
            </div>
          </div>
        </Card>

        <Card className="bg-[#1a1025] border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-500/20 rounded-lg">
              <HardDrive className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Space Used</p>
              <p className="text-xl font-bold text-white">
                {statsLoading ? '...' : formatBytes(stats?.totalBytes || 0)}
              </p>
            </div>
          </div>
        </Card>

        <Card className="bg-[#1a1025] border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-500/20 rounded-lg">
              <Clock className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Oldest File</p>
              {statsLoading ? (
                <p className="text-xl font-bold text-white">...</p>
              ) : stats?.oldestFile ? (
                <div>
                  <p className="text-sm font-medium text-white truncate max-w-[200px]">
                    {stats.oldestFile.name}
                  </p>
                  <p className="text-xs text-yellow-400">
                    {stats.oldestFile.daysRemaining} days remaining
                  </p>
                </div>
              ) : (
                <p className="text-sm text-gray-500">No deleted files</p>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Filter by Application */}
      <div className="flex items-center gap-4">
        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            className="min-w-[200px] justify-between"
            onClick={() => setAppDropdownOpen(!appDropdownOpen)}
          >
            {selectedAppId
              ? applications.find((a) => a.id === selectedAppId)?.name || 'All Applications'
              : 'All Applications'}
            <ChevronDown className="w-4 h-4 ml-2" />
          </Button>
          {appDropdownOpen && (
            <div className="absolute top-full left-0 mt-1 w-full bg-[#1a1025] border border-white/10 rounded-md shadow-lg z-10">
              <button
                className="w-full px-3 py-2 text-left text-sm text-white hover:bg-white/5 flex items-center gap-2"
                onClick={() => {
                  setSelectedAppId('');
                  setAppDropdownOpen(false);
                }}
              >
                {!selectedAppId && <Check className="w-4 h-4" />}
                <span className={!selectedAppId ? '' : 'ml-6'}>All Applications</span>
              </button>
              {applications.map((app) => (
                <button
                  key={app.id}
                  className="w-full px-3 py-2 text-left text-sm text-white hover:bg-white/5 flex items-center gap-2"
                  onClick={() => {
                    setSelectedAppId(app.id);
                    setAppDropdownOpen(false);
                  }}
                >
                  {selectedAppId === app.id && <Check className="w-4 h-4" />}
                  <span className={selectedAppId === app.id ? '' : 'ml-6'}>{app.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedFiles.size > 0 && (
        <div className="flex items-center gap-4 p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg">
          <span className="text-sm text-white">
            {selectedFiles.size} file{selectedFiles.size > 1 ? 's' : ''} selected
            <span className="text-gray-400 ml-2">({formatBytes(selectedSize)})</span>
          </span>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowRestoreDialog(true)}
            disabled={isMutating}
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Restore Selected
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowDeleteDialog(true)}
            disabled={isMutating}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete Permanently
          </Button>
        </div>
      )}

      {/* File List */}
      <Card className="bg-[#1a1025] border-white/10">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedFiles.size === deletedFiles.length && deletedFiles.length > 0}
                    onChange={selectAllFiles}
                    className="rounded border-white/20 bg-white/5"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                  Application
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                  Bucket
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                  Size
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                  Deleted
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                  Days Left
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filesLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Loading deleted files...
                  </td>
                </tr>
              ) : deletedFiles.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                    <Trash2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    Recycle bin is empty
                  </td>
                </tr>
              ) : (
                deletedFiles.map((file) => (
                  <tr
                    key={file.id}
                    className="border-b border-white/5 hover:bg-white/5"
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedFiles.has(file.id)}
                        onChange={() => toggleFileSelection(file.id)}
                        className="rounded border-white/20 bg-white/5"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <FileIcon className="w-4 h-4 text-gray-400" />
                        <span className="text-white text-sm truncate max-w-[200px]">
                          {file.originalName}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 truncate max-w-[200px]">
                        {file.key}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300">
                      {file.application?.name || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300">
                      {file.bucket?.name || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300">
                      {formatBytes(file.sizeBytes)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">
                      {formatDistanceToNow(new Date(file.deletedAt), { addSuffix: true })}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-sm font-medium ${
                          file.daysRemaining <= 7
                            ? 'text-red-400'
                            : file.daysRemaining <= 14
                            ? 'text-yellow-400'
                            : 'text-green-400'
                        }`}
                      >
                        {file.daysRemaining} days
                        {file.daysRemaining <= 7 && (
                          <AlertTriangle className="w-3 h-3 inline ml-1" />
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => restoreMutation.mutate(file.id)}
                          disabled={isMutating}
                          title="Restore"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteMutation.mutate(file.id)}
                          disabled={isMutating}
                          className="text-red-400 hover:text-red-300"
                          title="Delete permanently"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Empty Recycle Bin Dialog */}
      {showEmptyDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => setShowEmptyDialog(false)}
          />
          <div className="relative bg-[#1a1025] border border-white/10 rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              Empty Recycle Bin?
            </h2>
            <p className="text-gray-400 mb-4">
              This will permanently delete{' '}
              <span className="text-white font-medium">{stats?.totalFiles || 0} files</span>{' '}
              ({formatBytes(stats?.totalBytes || 0)}). This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setShowEmptyDialog(false)}
                disabled={emptyMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => emptyMutation.mutate()}
                disabled={emptyMutation.isPending}
              >
                {emptyMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Empty Recycle Bin
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Restore Dialog */}
      {showRestoreDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => setShowRestoreDialog(false)}
          />
          <div className="relative bg-[#1a1025] border border-white/10 rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-green-400" />
              Restore Files?
            </h2>
            <p className="text-gray-400 mb-4">
              This will restore{' '}
              <span className="text-white font-medium">{selectedFiles.size} files</span>{' '}
              ({formatBytes(selectedSize)}) to their original buckets. Quota usage will be added back.
            </p>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setShowRestoreDialog(false)}
                disabled={restoreMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={handleBulkRestore}
                disabled={restoreMutation.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                {restoreMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Restoring...
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Restore Files
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Dialog */}
      {showDeleteDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => setShowDeleteDialog(false)}
          />
          <div className="relative bg-[#1a1025] border border-white/10 rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              Delete Permanently?
            </h2>
            <p className="text-gray-400 mb-4">
              This will permanently delete{' '}
              <span className="text-white font-medium">{selectedFiles.size} files</span>{' '}
              ({formatBytes(selectedSize)}). This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setShowDeleteDialog(false)}
                disabled={deleteMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleBulkDelete}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Permanently
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
