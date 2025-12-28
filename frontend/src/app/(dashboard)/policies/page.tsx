'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import {
  Shield,
  Plus,
  Play,
  Pause,
  Trash2,
  Clock,
  Calendar,
  Settings,
  AlertCircle,
  CheckCircle,
  FileWarning,
  Timer,
  HardDrive,
} from 'lucide-react';

interface StoragePolicy {
  id: string;
  name: string;
  description: string | null;
  scope: 'GLOBAL' | 'APPLICATION' | 'BUCKET';
  applicationId: string | null;
  bucketId: string | null;
  policyType: 'RETENTION' | 'AUTO_DELETE' | 'SIZE_LIMIT' | 'CLEANUP_TEMP';
  rules: any;
  retentionDays: number | null;
  deleteAfterDays: number | null;
  schedule: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  application?: { id: string; name: string };
  bucket?: { id: string; name: string };
}

interface PoliciesResponse {
  data: StoragePolicy[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

interface Application {
  id: string;
  name: string;
}

interface Bucket {
  id: string;
  name: string;
}

const POLICY_TYPE_INFO: Record<string, { icon: React.ReactNode; color: string; description: string }> = {
  RETENTION: {
    icon: <Timer className="h-5 w-5" />,
    color: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    description: 'Keep files for a specified duration',
  },
  AUTO_DELETE: {
    icon: <Trash2 className="h-5 w-5" />,
    color: 'text-red-400 bg-red-500/10 border-red-500/20',
    description: 'Automatically delete files after a period',
  },
  SIZE_LIMIT: {
    icon: <HardDrive className="h-5 w-5" />,
    color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    description: 'Enforce storage size limits',
  },
  CLEANUP_TEMP: {
    icon: <FileWarning className="h-5 w-5" />,
    color: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    description: 'Clean up temporary files',
  },
};

export default function PoliciesPage() {
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [page, setPage] = useState(1);
  const limit = 20;

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scope, setScope] = useState<'GLOBAL' | 'APPLICATION' | 'BUCKET'>('GLOBAL');
  const [applicationId, setApplicationId] = useState<string>('');
  const [bucketId, setBucketId] = useState<string>('');
  const [policyType, setPolicyType] = useState<'RETENTION' | 'AUTO_DELETE' | 'SIZE_LIMIT' | 'CLEANUP_TEMP'>('RETENTION');
  const [retentionDays, setRetentionDays] = useState<string>('30');
  const [deleteAfterDays, setDeleteAfterDays] = useState<string>('90');
  const [schedule, setSchedule] = useState('0 2 * * *');
  const [isActive, setIsActive] = useState(true);

  const { data, isLoading } = useQuery({
    queryKey: ['policies', page, limit],
    queryFn: async () => {
      const { data } = await apiClient.get<PoliciesResponse>('/admin/policies', {
        params: { page, limit },
      });
      return data;
    },
  });

  const { data: applications } = useQuery({
    queryKey: ['applications-list'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: Application[] }>('/admin/applications', {
        params: { limit: 100 },
      });
      return data.data;
    },
  });

  const { data: buckets } = useQuery({
    queryKey: ['buckets-list'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: Bucket[] }>('/admin/buckets', {
        params: { limit: 100 },
      });
      return data.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (policyData: any) => {
      await apiClient.post('/admin/policies', policyData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policies'] });
      setIsCreateOpen(false);
      resetForm();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      await apiClient.patch(`/admin/policies/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policies'] });
    },
  });

  const executeMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.post(`/admin/policies/${id}/execute`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policies'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/admin/policies/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policies'] });
    },
  });

  const resetForm = () => {
    setName('');
    setDescription('');
    setScope('GLOBAL');
    setApplicationId('');
    setBucketId('');
    setPolicyType('RETENTION');
    setRetentionDays('30');
    setDeleteAfterDays('90');
    setSchedule('0 2 * * *');
    setIsActive(true);
  };

  const handleCreate = () => {
    const policyData: any = {
      name,
      description: description || undefined,
      scope,
      policyType,
      schedule,
      isActive,
    };

    if (scope === 'APPLICATION' && applicationId) {
      policyData.applicationId = applicationId;
    }
    if (scope === 'BUCKET' && bucketId) {
      policyData.bucketId = bucketId;
    }

    if (policyType === 'RETENTION') {
      policyData.retentionDays = parseInt(retentionDays);
    }
    if (policyType === 'AUTO_DELETE') {
      policyData.deleteAfterDays = parseInt(deleteAfterDays);
    }

    createMutation.mutate(policyData);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-[#6b21ef]/20 to-[#6b21ef]/5 border border-white/[0.08]">
            <Shield className="h-7 w-7 text-[#6b21ef]" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Storage Policies</h1>
            <p className="text-[#c4bbd3]">Manage automated storage rules and retention</p>
          </div>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#ee4f27] hover:bg-[#d94520] text-white">
              <Plus className="h-4 w-4 mr-2" />
              Create Policy
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Storage Policy</DialogTitle>
              <DialogDescription>
                Define automated rules for managing your storage
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Policy Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., 90-day retention policy"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional description..."
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Policy Type</Label>
                  <Select value={policyType} onValueChange={(v: any) => setPolicyType(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="RETENTION">Retention</SelectItem>
                      <SelectItem value="AUTO_DELETE">Auto Delete</SelectItem>
                      <SelectItem value="SIZE_LIMIT">Size Limit</SelectItem>
                      <SelectItem value="CLEANUP_TEMP">Cleanup Temp</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Scope</Label>
                  <Select value={scope} onValueChange={(v: any) => setScope(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GLOBAL">Global</SelectItem>
                      <SelectItem value="APPLICATION">Application</SelectItem>
                      <SelectItem value="BUCKET">Bucket</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {scope === 'APPLICATION' && (
                <div className="space-y-2">
                  <Label>Application</Label>
                  <Select value={applicationId} onValueChange={setApplicationId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select application" />
                    </SelectTrigger>
                    <SelectContent>
                      {applications?.map((app) => (
                        <SelectItem key={app.id} value={app.id}>
                          {app.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {scope === 'BUCKET' && (
                <div className="space-y-2">
                  <Label>Bucket</Label>
                  <Select value={bucketId} onValueChange={setBucketId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select bucket" />
                    </SelectTrigger>
                    <SelectContent>
                      {buckets?.map((bucket) => (
                        <SelectItem key={bucket.id} value={bucket.id}>
                          {bucket.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {policyType === 'RETENTION' && (
                <div className="space-y-2">
                  <Label htmlFor="retentionDays">Retention Days</Label>
                  <Input
                    id="retentionDays"
                    type="number"
                    value={retentionDays}
                    onChange={(e) => setRetentionDays(e.target.value)}
                    placeholder="30"
                  />
                </div>
              )}
              {policyType === 'AUTO_DELETE' && (
                <div className="space-y-2">
                  <Label htmlFor="deleteAfterDays">Delete After Days</Label>
                  <Input
                    id="deleteAfterDays"
                    type="number"
                    value={deleteAfterDays}
                    onChange={(e) => setDeleteAfterDays(e.target.value)}
                    placeholder="90"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="schedule">Schedule (Cron)</Label>
                <Input
                  id="schedule"
                  value={schedule}
                  onChange={(e) => setSchedule(e.target.value)}
                  placeholder="0 2 * * *"
                />
                <p className="text-xs text-[#c4bbd3]/60">Default: 2 AM daily</p>
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="isActive">Active</Label>
                <Switch
                  id="isActive"
                  checked={isActive}
                  onCheckedChange={setIsActive}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={!name || createMutation.isPending}
                className="bg-[#ee4f27] hover:bg-[#d94520]"
              >
                {createMutation.isPending ? 'Creating...' : 'Create Policy'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Policy Type Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        {Object.entries(POLICY_TYPE_INFO).map(([type, info]) => (
          <Card key={type} className="bg-white/[0.02] border-white/[0.08]">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${info.color}`}>
                  {info.icon}
                </div>
                <div>
                  <p className="font-medium text-white">{type.replace('_', ' ')}</p>
                  <p className="text-xs text-[#c4bbd3]/60">{info.description}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Policies List */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#6b21ef]/20 to-[#6b21ef]/5 border border-white/[0.08]">
              <Shield className="h-5 w-5 text-[#6b21ef]" />
            </div>
            <div>
              <CardTitle>Active Policies</CardTitle>
              <CardDescription>
                {data?.meta.total || 0} policies configured
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#ee4f27]/30 border-t-[#ee4f27]" />
            </div>
          ) : data?.data.length === 0 ? (
            <div className="py-12 text-center">
              <Shield className="h-12 w-12 text-[#c4bbd3]/30 mx-auto mb-3" />
              <p className="text-[#c4bbd3]">No policies configured yet</p>
              <p className="text-sm text-[#c4bbd3]/60 mt-1">
                Create your first storage policy to automate file management
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {data?.data.map((policy) => {
                const typeInfo = POLICY_TYPE_INFO[policy.policyType];
                return (
                  <div
                    key={policy.id}
                    className={`p-4 rounded-xl border transition-all ${
                      policy.isActive
                        ? 'bg-white/[0.02] border-white/[0.08]'
                        : 'bg-white/[0.01] border-white/[0.04] opacity-60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${typeInfo.color}`}>
                          {typeInfo.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-medium text-white">{policy.name}</h4>
                            <span className={`text-xs px-2 py-0.5 rounded-full border ${
                              policy.isActive
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : 'bg-gray-500/10 text-gray-400 border-gray-500/20'
                            }`}>
                              {policy.isActive ? 'Active' : 'Inactive'}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full border ${typeInfo.color}`}>
                              {policy.policyType.replace('_', ' ')}
                            </span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-white/[0.05] text-[#c4bbd3] border border-white/[0.08]">
                              {policy.scope}
                            </span>
                          </div>
                          {policy.description && (
                            <p className="text-sm text-[#c4bbd3]/70 mb-2">{policy.description}</p>
                          )}
                          <div className="flex flex-wrap items-center gap-4 text-xs text-[#c4bbd3]/60">
                            {policy.retentionDays && (
                              <span className="flex items-center gap-1">
                                <Timer className="h-3 w-3" />
                                {policy.retentionDays} day retention
                              </span>
                            )}
                            {policy.deleteAfterDays && (
                              <span className="flex items-center gap-1">
                                <Trash2 className="h-3 w-3" />
                                Delete after {policy.deleteAfterDays} days
                              </span>
                            )}
                            {policy.schedule && (
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {policy.schedule}
                              </span>
                            )}
                            {policy.lastRunAt && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                Last run: {formatDate(policy.lastRunAt)}
                              </span>
                            )}
                            {policy.application && (
                              <span>App: {policy.application.name}</span>
                            )}
                            {policy.bucket && (
                              <span>Bucket: {policy.bucket.name}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => executeMutation.mutate(policy.id)}
                          disabled={executeMutation.isPending}
                          title="Run now"
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => toggleMutation.mutate({ id: policy.id, isActive: !policy.isActive })}
                          title={policy.isActive ? 'Pause' : 'Activate'}
                        >
                          {policy.isActive ? (
                            <Pause className="h-4 w-4" />
                          ) : (
                            <CheckCircle className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-400 hover:bg-red-500/10"
                          onClick={() => {
                            if (confirm('Delete this policy?')) {
                              deleteMutation.mutate(policy.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {data && data.meta.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Previous
              </Button>
              <span className="text-sm text-[#c4bbd3]">
                Page {page} of {data.meta.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(data.meta.totalPages, p + 1))}
                disabled={page === data.meta.totalPages}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
