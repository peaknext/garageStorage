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
  AppWindow,
  FolderOpen,
  Key,
  RefreshCw,
  Trash2,
  Copy,
  CheckCircle,
  Globe,
  Lock,
  Webhook,
  ChevronRight,
} from 'lucide-react';
import { useState } from 'react';

interface Application {
  id: string;
  name: string;
  slug: string;
  description?: string;
  status: string;
  maxStorageBytes: number;
  usedStorageBytes: number;
  bucketCount: number;
  createdAt: string;
  updatedAt: string;
}

interface Bucket {
  id: string;
  name: string;
  usedBytes: number;
  quotaBytes: number | null;
  fileCount: number;
  isPublic: boolean;
  createdAt: string;
}

export default function ApplicationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const { data: app, isLoading } = useQuery({
    queryKey: ['application', params.id],
    queryFn: async () => {
      const { data } = await apiClient.get<Application>(`/admin/applications/${params.id}`);
      return data;
    },
  });

  const { data: bucketsData } = useQuery({
    queryKey: ['application-buckets', params.id],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: Bucket[] }>('/admin/buckets', {
        params: { limit: 100 },
      });
      // Filter buckets for this application (would need backend support ideally)
      return data;
    },
  });

  const { data: webhooks } = useQuery({
    queryKey: ['application-webhooks', params.id],
    queryFn: async () => {
      const { data } = await apiClient.get<{ id: string; name: string; isActive: boolean }[]>(
        `/admin/applications/${params.id}/webhooks`
      );
      return data;
    },
  });

  const regenerateKeyMutation = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post<{ apiKey: string }>(`/admin/applications/${params.id}/regenerate-key`);
      return data;
    },
    onSuccess: (data) => {
      setNewApiKey(data.apiKey);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiClient.delete(`/admin/applications/${params.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      router.push('/applications');
    },
  });

  const copyApiKey = () => {
    if (newApiKey) {
      navigator.clipboard.writeText(newApiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

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

  if (!app) {
    return (
      <div className="text-center py-12">
        <AppWindow className="h-16 w-16 text-[#c4bbd3]/30 mx-auto mb-4" />
        <p className="text-lg font-medium text-white mb-2">Application not found</p>
        <Link href="/applications">
          <Button variant="outline">Back to Applications</Button>
        </Link>
      </div>
    );
  }

  const storagePercentage = (app.usedStorageBytes / app.maxStorageBytes) * 100;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/applications">
            <Button variant="ghost" size="icon" className="h-10 w-10">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-[#ee4f27]/20 to-[#ee4f27]/5 border border-white/[0.08]">
              <AppWindow className="h-7 w-7 text-[#ee4f27]" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white tracking-tight">{app.name}</h1>
              <p className="text-[#c4bbd3]">{app.slug}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`text-sm px-4 py-2 rounded-full font-medium ${
              app.status === 'ACTIVE'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-white/[0.05] text-[#c4bbd3] border border-white/[0.1]'
            }`}
          >
            {app.status}
          </span>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Storage Used</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {formatBytes(app.usedStorageBytes)}
            </div>
            <p className="text-sm text-[#c4bbd3]/70 mt-1">
              of {formatBytes(app.maxStorageBytes)}
            </p>
            <Progress value={storagePercentage} className="mt-3 h-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Buckets</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{app.bucketCount}</div>
            <p className="text-sm text-[#c4bbd3]/70 mt-1">storage containers</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Created</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{formatDate(app.createdAt)}</div>
            <p className="text-sm text-[#c4bbd3]/70 mt-1">application created</p>
          </CardContent>
        </Card>
      </div>

      {/* API Key Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#6b21ef]/20 to-[#6b21ef]/5 border border-white/[0.08]">
              <Key className="h-5 w-5 text-[#6b21ef]" />
            </div>
            <div>
              <CardTitle>API Key</CardTitle>
              <CardDescription>Manage your application's API key</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {newApiKey ? (
            <div className="space-y-4">
              <div className="rounded-xl bg-[#ee4f27]/10 border border-[#ee4f27]/20 p-4">
                <p className="text-sm font-medium text-white mb-3">New API Key (save it now!):</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm bg-black/30 text-[#ee4f27] p-3 rounded-lg font-mono break-all">
                    {newApiKey}
                  </code>
                  <Button size="icon" variant="outline" onClick={copyApiKey}>
                    {copied ? <CheckCircle className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <Button variant="outline" onClick={() => setNewApiKey(null)}>
                Done
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/[0.08]">
              <div>
                <p className="text-white font-medium">Regenerate API Key</p>
                <p className="text-sm text-[#c4bbd3]">This will invalidate the current key</p>
              </div>
              <Button
                variant="outline"
                onClick={() => regenerateKeyMutation.mutate()}
                disabled={regenerateKeyMutation.isPending}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${regenerateKeyMutation.isPending ? 'animate-spin' : ''}`} />
                {regenerateKeyMutation.isPending ? 'Regenerating...' : 'Regenerate'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Buckets List */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#6b21ef]/20 to-[#6b21ef]/5 border border-white/[0.08]">
              <FolderOpen className="h-5 w-5 text-[#6b21ef]" />
            </div>
            <div>
              <CardTitle>Buckets</CardTitle>
              <CardDescription>Storage containers in this application</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {bucketsData?.data && bucketsData.data.length > 0 ? (
            <div className="space-y-3">
              {bucketsData.data.slice(0, 5).map((bucket) => (
                <Link key={bucket.id} href={`/buckets/${bucket.id}`}>
                  <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/[0.08] hover:border-[#6b21ef]/30 hover:bg-white/[0.03] transition-all duration-200 cursor-pointer">
                    <div className="flex items-center gap-3">
                      <FolderOpen className="h-5 w-5 text-[#6b21ef]" />
                      <div>
                        <p className="font-medium text-white">{bucket.name}</p>
                        <p className="text-sm text-[#c4bbd3]">{bucket.fileCount} files</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-[#c4bbd3]">{formatBytes(bucket.usedBytes)}</span>
                      {bucket.isPublic ? (
                        <Globe className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <Lock className="h-4 w-4 text-[#c4bbd3]" />
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center">
              <FolderOpen className="h-12 w-12 text-[#c4bbd3]/30 mx-auto mb-3" />
              <p className="text-[#c4bbd3]">No buckets yet</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Webhooks Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#6b21ef]/20 to-[#6b21ef]/5 border border-white/[0.08]">
                <Webhook className="h-5 w-5 text-[#6b21ef]" />
              </div>
              <div>
                <CardTitle>Webhooks</CardTitle>
                <CardDescription>Event notifications for this application</CardDescription>
              </div>
            </div>
            <Link href={`/applications/${params.id}/webhooks`}>
              <Button variant="outline">
                Manage Webhooks
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {webhooks && webhooks.length > 0 ? (
            <div className="space-y-2">
              {webhooks.slice(0, 3).map((webhook) => (
                <div
                  key={webhook.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.08]"
                >
                  <div className="flex items-center gap-3">
                    <Webhook className="h-4 w-4 text-[#6b21ef]" />
                    <span className="text-sm text-white">{webhook.name}</span>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      webhook.isActive
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-white/[0.05] text-[#c4bbd3] border border-white/[0.1]'
                    }`}
                  >
                    {webhook.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              ))}
              {webhooks.length > 3 && (
                <p className="text-sm text-[#c4bbd3]/60 text-center pt-2">
                  +{webhooks.length - 3} more webhooks
                </p>
              )}
            </div>
          ) : (
            <div className="py-6 text-center">
              <Webhook className="h-10 w-10 text-[#c4bbd3]/30 mx-auto mb-2" />
              <p className="text-sm text-[#c4bbd3]">No webhooks configured</p>
              <Link href={`/applications/${params.id}/webhooks`}>
                <Button variant="link" className="text-[#6b21ef] mt-2">
                  Configure webhooks
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

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
              <p className="text-white font-medium">Delete Application</p>
              <p className="text-sm text-[#c4bbd3]">This will delete all buckets and files</p>
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
