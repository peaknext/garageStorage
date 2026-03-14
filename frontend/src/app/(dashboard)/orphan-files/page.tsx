'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/lib/api-client';
import { formatBytes, formatDate } from '@/lib/utils';
import {
  FileX,
  RefreshCw,
  Trash2,
  Database,
  Cloud,
  AlertTriangle,
  CheckSquare,
  Square,
  Loader2,
  HardDrive,
  FolderOpen,
} from 'lucide-react';

interface DbOrphan {
  id: string;
  key: string;
  bucketId: string;
  bucketName: string;
  s3BucketId: string;
  sizeBytes: number;
  createdAt: string;
  originalName: string;
  mimeType: string;
}

interface S3Orphan {
  key: string;
  bucketId: string;
  bucketName: string;
  s3BucketId: string;
  sizeBytes: number;
  lastModified: string;
}

interface OrphanScanResult {
  dbOrphans: DbOrphan[];
  s3Orphans: S3Orphan[];
  stats: {
    dbOrphanCount: number;
    dbOrphanBytes: number;
    s3OrphanCount: number;
    s3OrphanBytes: number;
    bucketsScanned: number;
  };
}

interface Bucket {
  id: string;
  name: string;
}

interface CleanupDbResult {
  deletedDbRecords: number;
  freedBytes: number;
}

interface CleanupS3Result {
  deletedS3Files: number;
  freedBytes: number;
}

interface CleanupAllResult {
  deletedDbRecords: number;
  deletedS3Files: number;
  freedBytes: number;
}

export default function OrphanFilesPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedBucket, setSelectedBucket] = useState<string>('all');
  const [selectedDbOrphans, setSelectedDbOrphans] = useState<Set<string>>(new Set());
  const [selectedS3Orphans, setSelectedS3Orphans] = useState<Set<string>>(new Set());
  const [showCleanupDbDialog, setShowCleanupDbDialog] = useState(false);
  const [showCleanupS3Dialog, setShowCleanupS3Dialog] = useState(false);
  const [showCleanupAllDialog, setShowCleanupAllDialog] = useState(false);

  const { data: buckets } = useQuery({
    queryKey: ['buckets-list'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: Bucket[] }>('/admin/buckets', {
        params: { limit: 100 },
      });
      return data.data;
    },
  });

  const { data: scanResult, isLoading: isScanning, refetch: rescan } = useQuery({
    queryKey: ['orphan-scan', selectedBucket],
    queryFn: async () => {
      const params = selectedBucket !== 'all' ? { bucketId: selectedBucket } : {};
      const { data } = await apiClient.get<OrphanScanResult>('/admin/orphan-files/scan', { params });
      return data;
    },
    refetchOnWindowFocus: false,
  });

  const cleanupDbMutation = useMutation<CleanupDbResult, Error, string[] | undefined>({
    mutationFn: async (fileIds?: string[]) => {
      const body: Record<string, unknown> = {};
      if (fileIds && fileIds.length > 0) {
        body.fileIds = fileIds;
      }
      if (selectedBucket !== 'all') {
        body.bucketId = selectedBucket;
      }
      const { data } = await apiClient.post<CleanupDbResult>('/admin/orphan-files/cleanup/db', body);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['orphan-scan'] });
      setSelectedDbOrphans(new Set());
      toast({
        title: 'Cleanup Complete',
        description: `Deleted ${data.deletedDbRecords} orphan database records, freed ${formatBytes(data.freedBytes)}`,
        variant: 'success',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Cleanup Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const cleanupS3Mutation = useMutation<CleanupS3Result, Error, Array<{ key: string; s3BucketId: string }> | undefined>({
    mutationFn: async (orphans?: Array<{ key: string; s3BucketId: string }>) => {
      const body: Record<string, unknown> = {};
      if (orphans && orphans.length > 0) {
        body.orphans = orphans;
      }
      if (selectedBucket !== 'all') {
        body.bucketId = selectedBucket;
      }
      const { data } = await apiClient.post<CleanupS3Result>('/admin/orphan-files/cleanup/s3', body);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['orphan-scan'] });
      setSelectedS3Orphans(new Set());
      toast({
        title: 'Cleanup Complete',
        description: `Deleted ${data.deletedS3Files} orphan S3 files, freed ${formatBytes(data.freedBytes)}`,
        variant: 'success',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Cleanup Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const cleanupAllMutation = useMutation<CleanupAllResult, Error, void>({
    mutationFn: async () => {
      const body: Record<string, unknown> = {};
      if (selectedBucket !== 'all') {
        body.bucketId = selectedBucket;
      }
      const { data } = await apiClient.post<CleanupAllResult>('/admin/orphan-files/cleanup/all', body);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['orphan-scan'] });
      setSelectedDbOrphans(new Set());
      setSelectedS3Orphans(new Set());
      toast({
        title: 'Full Cleanup Complete',
        description: `Deleted ${data.deletedDbRecords} DB records and ${data.deletedS3Files} S3 files, freed ${formatBytes(data.freedBytes)}`,
        variant: 'success',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Cleanup Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const toggleDbOrphan = (id: string) => {
    const newSelected = new Set(selectedDbOrphans);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedDbOrphans(newSelected);
  };

  const toggleS3Orphan = (key: string) => {
    const newSelected = new Set(selectedS3Orphans);
    if (newSelected.has(key)) {
      newSelected.delete(key);
    } else {
      newSelected.add(key);
    }
    setSelectedS3Orphans(newSelected);
  };

  const toggleAllDbOrphans = () => {
    if (selectedDbOrphans.size === (scanResult?.dbOrphans.length || 0)) {
      setSelectedDbOrphans(new Set());
    } else {
      setSelectedDbOrphans(new Set(scanResult?.dbOrphans.map((o) => o.id) || []));
    }
  };

  const toggleAllS3Orphans = () => {
    if (selectedS3Orphans.size === (scanResult?.s3Orphans.length || 0)) {
      setSelectedS3Orphans(new Set());
    } else {
      setSelectedS3Orphans(new Set(scanResult?.s3Orphans.map((o) => o.key) || []));
    }
  };

  const totalOrphans = (scanResult?.stats.dbOrphanCount || 0) + (scanResult?.stats.s3OrphanCount || 0);
  const totalOrphanBytes = (scanResult?.stats.dbOrphanBytes || 0) + (scanResult?.stats.s3OrphanBytes || 0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500/20 to-orange-500/5 border border-white/[0.08]">
            <FileX className="h-7 w-7 text-orange-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Orphan Files</h1>
            <p className="text-[#c4bbd3]">Detect and clean up mismatched files between database and S3</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedBucket} onValueChange={setSelectedBucket}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All buckets" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Buckets</SelectItem>
              {buckets?.map((bucket) => (
                <SelectItem key={bucket.id} value={bucket.id}>
                  {bucket.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={() => rescan()}
            disabled={isScanning}
          >
            {isScanning ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Scan
              </>
            )}
          </Button>
          {totalOrphans > 0 && (
            <Button
              className="bg-orange-500 hover:bg-orange-600 text-white"
              onClick={() => setShowCleanupAllDialog(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Cleanup All
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-6 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-400" />
              <CardDescription>Total Orphans</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{totalOrphans}</div>
            <p className="text-sm text-[#c4bbd3]/70 mt-1">files to review</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-orange-400" />
              <CardDescription>Orphan Size</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{formatBytes(totalOrphanBytes)}</div>
            <p className="text-sm text-[#c4bbd3]/70 mt-1">can be freed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-blue-400" />
              <CardDescription>DB Orphans</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{scanResult?.stats.dbOrphanCount || 0}</div>
            <p className="text-sm text-[#c4bbd3]/70 mt-1">in database only</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Cloud className="h-4 w-4 text-purple-400" />
              <CardDescription>S3 Orphans</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{scanResult?.stats.s3OrphanCount || 0}</div>
            <p className="text-sm text-[#c4bbd3]/70 mt-1">in S3 only</p>
          </CardContent>
        </Card>
      </div>

      {/* DB Orphans Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-500/5 border border-white/[0.08]">
                <Database className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <CardTitle>Database Orphans</CardTitle>
                <CardDescription>
                  Files in database but missing from S3 storage
                </CardDescription>
              </div>
            </div>
            {selectedDbOrphans.size > 0 && (
              <Button
                variant="outline"
                className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                onClick={() => setShowCleanupDbDialog(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Selected ({selectedDbOrphans.size})
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isScanning ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500/30 border-t-blue-500" />
            </div>
          ) : !scanResult?.dbOrphans.length ? (
            <div className="py-12 text-center">
              <Database className="h-12 w-12 text-[#c4bbd3]/30 mx-auto mb-3" />
              <p className="text-[#c4bbd3]">No database orphans found</p>
              <p className="text-sm text-[#c4bbd3]/60 mt-1">All database records have matching S3 files</p>
            </div>
          ) : (
            <div className="rounded-xl border border-white/[0.08] overflow-hidden">
              <div className="grid grid-cols-[auto_1fr_120px_100px_100px] gap-4 px-4 py-3 bg-white/[0.02] border-b border-white/[0.08] text-sm font-medium text-[#c4bbd3]">
                <div className="flex items-center">
                  <button onClick={toggleAllDbOrphans} className="p-1 hover:bg-white/10 rounded">
                    {selectedDbOrphans.size === scanResult.dbOrphans.length ? (
                      <CheckSquare className="h-4 w-4 text-[#ee4f27]" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <div>File</div>
                <div>Bucket</div>
                <div>Size</div>
                <div>Created</div>
              </div>
              {scanResult.dbOrphans.map((orphan) => (
                <div
                  key={orphan.id}
                  className="grid grid-cols-[auto_1fr_120px_100px_100px] gap-4 px-4 py-3 border-b border-white/[0.06] hover:bg-white/[0.02] transition-colors items-center"
                >
                  <div className="flex items-center">
                    <button
                      onClick={() => toggleDbOrphan(orphan.id)}
                      className="p-1 hover:bg-white/10 rounded"
                    >
                      {selectedDbOrphans.has(orphan.id) ? (
                        <CheckSquare className="h-4 w-4 text-[#ee4f27]" />
                      ) : (
                        <Square className="h-4 w-4 text-[#c4bbd3]" />
                      )}
                    </button>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{orphan.originalName}</p>
                    <p className="text-xs text-[#c4bbd3]/60 truncate">{orphan.key}</p>
                  </div>
                  <div className="text-sm text-[#c4bbd3]">{orphan.bucketName}</div>
                  <div className="text-sm text-[#c4bbd3]">{formatBytes(orphan.sizeBytes)}</div>
                  <div className="text-sm text-[#c4bbd3]/70">{formatDate(orphan.createdAt)}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* S3 Orphans Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500/20 to-purple-500/5 border border-white/[0.08]">
                <Cloud className="h-5 w-5 text-purple-400" />
              </div>
              <div>
                <CardTitle>S3 Orphans</CardTitle>
                <CardDescription>
                  Files in S3 storage but missing from database
                </CardDescription>
              </div>
            </div>
            {selectedS3Orphans.size > 0 && (
              <Button
                variant="outline"
                className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                onClick={() => setShowCleanupS3Dialog(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Selected ({selectedS3Orphans.size})
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isScanning ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-purple-500/30 border-t-purple-500" />
            </div>
          ) : !scanResult?.s3Orphans.length ? (
            <div className="py-12 text-center">
              <Cloud className="h-12 w-12 text-[#c4bbd3]/30 mx-auto mb-3" />
              <p className="text-[#c4bbd3]">No S3 orphans found</p>
              <p className="text-sm text-[#c4bbd3]/60 mt-1">All S3 files have matching database records</p>
            </div>
          ) : (
            <div className="rounded-xl border border-white/[0.08] overflow-hidden">
              <div className="grid grid-cols-[auto_1fr_120px_100px_100px] gap-4 px-4 py-3 bg-white/[0.02] border-b border-white/[0.08] text-sm font-medium text-[#c4bbd3]">
                <div className="flex items-center">
                  <button onClick={toggleAllS3Orphans} className="p-1 hover:bg-white/10 rounded">
                    {selectedS3Orphans.size === scanResult.s3Orphans.length ? (
                      <CheckSquare className="h-4 w-4 text-[#ee4f27]" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <div>Key</div>
                <div>Bucket</div>
                <div>Size</div>
                <div>Modified</div>
              </div>
              {scanResult.s3Orphans.map((orphan) => (
                <div
                  key={orphan.key}
                  className="grid grid-cols-[auto_1fr_120px_100px_100px] gap-4 px-4 py-3 border-b border-white/[0.06] hover:bg-white/[0.02] transition-colors items-center"
                >
                  <div className="flex items-center">
                    <button
                      onClick={() => toggleS3Orphan(orphan.key)}
                      className="p-1 hover:bg-white/10 rounded"
                    >
                      {selectedS3Orphans.has(orphan.key) ? (
                        <CheckSquare className="h-4 w-4 text-[#ee4f27]" />
                      ) : (
                        <Square className="h-4 w-4 text-[#c4bbd3]" />
                      )}
                    </button>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{orphan.key}</p>
                  </div>
                  <div className="text-sm text-[#c4bbd3]">{orphan.bucketName}</div>
                  <div className="text-sm text-[#c4bbd3]">{formatBytes(orphan.sizeBytes)}</div>
                  <div className="text-sm text-[#c4bbd3]/70">{formatDate(orphan.lastModified)}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cleanup DB Dialog */}
      <AlertDialog
        open={showCleanupDbDialog}
        onOpenChange={setShowCleanupDbDialog}
        title={`Delete ${selectedDbOrphans.size} database record(s)?`}
        description="This will remove the orphan records from the database. The associated S3 files (if any) will not be affected."
        variant="destructive"
        confirmLabel="Delete Records"
        onConfirm={() => {
          cleanupDbMutation.mutate(Array.from(selectedDbOrphans));
          setShowCleanupDbDialog(false);
        }}
        loading={cleanupDbMutation.isPending}
      />

      {/* Cleanup S3 Dialog */}
      <AlertDialog
        open={showCleanupS3Dialog}
        onOpenChange={setShowCleanupS3Dialog}
        title={`Delete ${selectedS3Orphans.size} S3 file(s)?`}
        description="This will permanently delete the orphan files from S3 storage. This action cannot be undone."
        variant="destructive"
        confirmLabel="Delete Files"
        onConfirm={() => {
          const orphansToDelete = scanResult?.s3Orphans
            .filter((o) => selectedS3Orphans.has(o.key))
            .map((o) => ({ key: o.key, s3BucketId: o.s3BucketId }));
          cleanupS3Mutation.mutate(orphansToDelete);
          setShowCleanupS3Dialog(false);
        }}
        loading={cleanupS3Mutation.isPending}
      />

      {/* Cleanup All Dialog */}
      <AlertDialog
        open={showCleanupAllDialog}
        onOpenChange={setShowCleanupAllDialog}
        title="Clean up all orphan files?"
        description={`This will delete ${scanResult?.stats.dbOrphanCount || 0} database records and ${scanResult?.stats.s3OrphanCount || 0} S3 files, freeing approximately ${formatBytes(totalOrphanBytes)}. This action cannot be undone.`}
        variant="destructive"
        confirmLabel="Delete All Orphans"
        onConfirm={() => {
          cleanupAllMutation.mutate();
          setShowCleanupAllDialog(false);
        }}
        loading={cleanupAllMutation.isPending}
      />
    </div>
  );
}
