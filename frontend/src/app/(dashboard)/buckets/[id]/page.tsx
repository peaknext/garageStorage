'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { apiClient } from '@/lib/api-client';
import { formatBytes, formatDate } from '@/lib/utils';
import {
  ArrowLeft,
  FolderOpen,
  File,
  Trash2,
  Globe,
  Lock,
  Download,
  Upload,
  Clock,
  Database,
  RefreshCw,
  Copy,
  Check,
} from 'lucide-react';
import { useState } from 'react';
import { FileList } from '@/components/files/file-list';
import { UploadModal } from '@/components/files/upload-modal';
import { ShareModal } from '@/components/files/share-modal';
import { useToast } from '@/hooks/use-toast';

interface Bucket {
  id: string;
  name: string;
  garageBucketId: string;
  usedBytes: number;
  quotaBytes: number | null;
  fileCount: number;
  isPublic: boolean;
  corsEnabled: boolean;
  versioningEnabled: boolean;
  application: {
    name: string;
    slug: string;
  };
  createdAt: string;
  updatedAt: string;
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
}

export default function BucketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [shareFile, setShareFile] = useState<FileItem | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const { data: bucket, isLoading } = useQuery({
    queryKey: ['bucket', params.id],
    queryFn: async () => {
      const { data } = await apiClient.get<Bucket>(`/admin/buckets/${params.id}`);
      return data;
    },
  });

  const { data: filesData, isLoading: filesLoading, refetch: refetchFiles } = useQuery({
    queryKey: ['bucket-files', params.id],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: FileItem[]; meta: { total: number } }>(
        `/admin/buckets/${params.id}/files`
      );
      return data;
    },
    enabled: !!bucket,
  });

  const files = filesData?.data;

  const syncFilesMutation = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post<{
        synced: number;
        skipped: number;
        totalInS3: number;
        newUsedBytes: number;
      }>(`/admin/buckets/${params.id}/files/sync`);
      return data;
    },
    onSuccess: async (data) => {
      await refetchFiles();
      queryClient.invalidateQueries({ queryKey: ['bucket', params.id] });
      if (data.synced > 0) {
        toast({
          title: 'Files Synced',
          description: `Synced ${data.synced} file(s) from Garage S3`,
          variant: 'success',
        });
      } else {
        toast({
          title: 'Already in Sync',
          description: `No new files to sync (${data.totalInS3} files already in sync)`,
          variant: 'default',
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Sync Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiClient.delete(`/admin/buckets/${params.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['buckets'] });
      router.push('/buckets');
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="relative">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#ee4f27]/30 border-t-[#ee4f27]" />
          <div className="absolute inset-0 h-10 w-10 animate-pulse rounded-full bg-[#ee4f27]/10" />
        </div>
      </div>
    );
  }

  if (!bucket) {
    return (
      <div className="text-center py-12">
        <FolderOpen className="h-16 w-16 text-[#c4bbd3]/30 mx-auto mb-4" />
        <p className="text-lg font-medium text-white mb-2">Bucket not found</p>
        <Link href="/buckets">
          <Button variant="outline">Back to Buckets</Button>
        </Link>
      </div>
    );
  }

  const storagePercentage = bucket.quotaBytes
    ? (bucket.usedBytes / bucket.quotaBytes) * 100
    : 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/buckets">
            <Button variant="ghost" size="icon" className="h-10 w-10">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-[#6b21ef]/20 to-[#6b21ef]/5 border border-white/[0.08]">
              <FolderOpen className="h-7 w-7 text-[#6b21ef]" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white tracking-tight">{bucket.name}</h1>
              <p className="text-[#c4bbd3]">{bucket.application?.name || 'Unknown App'}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {bucket.isPublic ? (
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <Globe className="h-4 w-4 text-emerald-400" />
              <span className="text-sm font-medium text-emerald-400">Public</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.05] border border-white/[0.1]">
              <Lock className="h-4 w-4 text-[#c4bbd3]" />
              <span className="text-sm font-medium text-[#c4bbd3]">Private</span>
            </div>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-6 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-[#6b21ef]" />
              <CardDescription>Storage Used</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {formatBytes(bucket.usedBytes)}
            </div>
            {bucket.quotaBytes && (
              <>
                <p className="text-sm text-[#c4bbd3]/70 mt-1">
                  of {formatBytes(bucket.quotaBytes)}
                </p>
                <Progress value={storagePercentage} className="mt-3 h-2" />
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <File className="h-4 w-4 text-[#ee4f27]" />
              <CardDescription>Files</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{bucket.fileCount}</div>
            <p className="text-sm text-[#c4bbd3]/70 mt-1">total files</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-emerald-400" />
              <CardDescription>Created</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{formatDate(bucket.createdAt)}</div>
            <p className="text-sm text-[#c4bbd3]/70 mt-1">bucket created</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Upload className="h-4 w-4 text-sky-400" />
              <CardDescription>Last Updated</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{formatDate(bucket.updatedAt)}</div>
            <p className="text-sm text-[#c4bbd3]/70 mt-1">last modified</p>
          </CardContent>
        </Card>
      </div>

      {/* Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#6b21ef]/20 to-[#6b21ef]/5 border border-white/[0.08]">
              <FolderOpen className="h-5 w-5 text-[#6b21ef]" />
            </div>
            <div>
              <CardTitle>Bucket Settings</CardTitle>
              <CardDescription>Configuration for this bucket</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Garage Bucket ID */}
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.08]">
              <p className="text-sm font-medium text-[#c4bbd3] mb-2">Garage Bucket ID</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm font-mono text-white bg-black/20 px-3 py-2 rounded-lg overflow-x-auto">
                  {bucket.garageBucketId}
                </code>
                <button
                  onClick={() => copyToClipboard(bucket.garageBucketId)}
                  className="p-2 rounded-lg hover:bg-white/[0.05] transition-colors"
                  title="Copy to clipboard"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <Copy className="h-4 w-4 text-[#c4bbd3]" />
                  )}
                </button>
              </div>
            </div>

            {/* Settings Grid */}
            <div className="grid gap-4 md:grid-cols-3">
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.08]">
                <p className="text-sm font-medium text-[#c4bbd3] mb-2">Access</p>
                <div className="flex items-center gap-2">
                  {bucket.isPublic ? (
                    <>
                      <Globe className="h-5 w-5 text-emerald-400" />
                      <span className="text-white font-medium">Public</span>
                    </>
                  ) : (
                    <>
                      <Lock className="h-5 w-5 text-[#c4bbd3]" />
                      <span className="text-white font-medium">Private</span>
                    </>
                  )}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.08]">
                <p className="text-sm font-medium text-[#c4bbd3] mb-2">CORS</p>
                <span className={`text-white font-medium ${bucket.corsEnabled ? 'text-emerald-400' : 'text-[#c4bbd3]'}`}>
                  {bucket.corsEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.08]">
                <p className="text-sm font-medium text-[#c4bbd3] mb-2">Versioning</p>
                <span className={`text-white font-medium ${bucket.versioningEnabled ? 'text-emerald-400' : 'text-[#c4bbd3]'}`}>
                  {bucket.versioningEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Files Management */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#ee4f27]/20 to-[#ee4f27]/5 border border-white/[0.08]">
                <File className="h-5 w-5 text-[#ee4f27]" />
              </div>
              <div>
                <CardTitle>Files</CardTitle>
                <CardDescription>{files?.length || 0} files in this bucket</CardDescription>
              </div>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => syncFilesMutation.mutate()}
                disabled={syncFilesMutation.isPending}
              >
                {syncFilesMutation.isPending ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Sync Files
                  </>
                )}
              </Button>
              <Button onClick={() => setShowUploadModal(true)}>
                <Upload className="mr-2 h-4 w-4" />
                Upload Files
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <FileList
            files={files || []}
            bucketId={params.id as string}
            isLoading={filesLoading}
            onShare={(file) => setShareFile(file)}
          />
        </CardContent>
      </Card>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <UploadModal
            bucketId={params.id as string}
            onClose={() => setShowUploadModal(false)}
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: ['bucket', params.id] });
            }}
          />
        </div>
      )}

      {/* Share Modal */}
      {shareFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <ShareModal
            fileId={shareFile.id}
            fileName={shareFile.originalName}
            onClose={() => setShareFile(null)}
          />
        </div>
      )}

      {/* Danger Zone */}
      <Card className="border-red-500/20">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-red-500/20 to-red-500/5 border border-red-500/20">
              <Trash2 className="h-5 w-5 text-red-400" />
            </div>
            <div>
              <CardTitle className="text-red-400">Danger Zone</CardTitle>
              <CardDescription>Irreversible actions</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 rounded-xl bg-red-500/5 border border-red-500/20">
            <div>
              <p className="text-white font-medium">Delete Bucket</p>
              <p className="text-sm text-[#c4bbd3]">This will delete all files in the bucket</p>
            </div>
            {deleteConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-[#c4bbd3]">Are you sure?</span>
                <Button
                  size="sm"
                  className="bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/20"
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? 'Deleting...' : 'Yes, Delete'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setDeleteConfirm(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                onClick={() => setDeleteConfirm(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
