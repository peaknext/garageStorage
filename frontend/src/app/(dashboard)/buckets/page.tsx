'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { apiClient } from '@/lib/api-client';
import { formatBytes, formatDate } from '@/lib/utils';
import { Plus, FolderOpen, Globe, Lock, Files, ChevronDown } from 'lucide-react';

interface Bucket {
  id: string;
  name: string;
  usedBytes: number;
  quotaBytes: number | null;
  fileCount: number;
  isPublic: boolean;
  createdAt: string;
}

interface Application {
  id: string;
  name: string;
  slug: string;
}

export default function BucketsPage() {
  const queryClient = useQueryClient();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newBucket, setNewBucket] = useState({ name: '', isPublic: false, applicationId: '' });

  const { data: buckets, isLoading } = useQuery({
    queryKey: ['buckets'],
    queryFn: async () => {
      const response = await apiClient.get<{ data: Bucket[]; pagination: unknown }>('/admin/buckets', {
        params: { limit: 50 },
      });
      const bucketsList = response.data?.data;
      return Array.isArray(bucketsList) ? bucketsList : [];
    },
  });

  const { data: applications } = useQuery({
    queryKey: ['applications'],
    queryFn: async () => {
      const response = await apiClient.get<{ data: Application[]; pagination: unknown }>('/admin/applications', {
        params: { limit: 100 },
      });
      const apps = response.data?.data;
      return Array.isArray(apps) ? apps : [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; isPublic: boolean; applicationId: string }) => {
      const response = await apiClient.post('/admin/buckets', data);
      return response.data;
    },
    onSuccess: () => {
      setShowCreateForm(false);
      setNewBucket({ name: '', isPublic: false, applicationId: '' });
      queryClient.invalidateQueries({ queryKey: ['buckets'] });
    },
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(newBucket);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Buckets</h1>
          <p className="text-[#c4bbd3] mt-1">Manage your storage buckets</p>
        </div>
        <Button onClick={() => setShowCreateForm(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Bucket
        </Button>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <Card className="animate-scale-in">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#6b21ef]/20 to-[#6b21ef]/5 border border-[#6b21ef]/20">
                <FolderOpen className="h-5 w-5 text-[#6b21ef]" />
              </div>
              <div>
                <CardTitle>Create New Bucket</CardTitle>
                <CardDescription>Configure your storage bucket settings</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium text-white">Application</label>
                <div className="relative">
                  <select
                    value={newBucket.applicationId}
                    onChange={(e) =>
                      setNewBucket({ ...newBucket, applicationId: e.target.value })
                    }
                    required
                    className="w-full h-11 px-4 pr-10 rounded-xl border border-white/[0.1] bg-white/[0.03] text-white placeholder:text-[#c4bbd3]/60 focus:outline-none focus:ring-2 focus:ring-[#ee4f27]/50 focus:border-[#ee4f27]/50 hover:border-white/[0.2] transition-colors appearance-none cursor-pointer"
                  >
                    <option value="" disabled className="bg-[#0e0918] text-[#c4bbd3]">
                      Select an application
                    </option>
                    {applications?.map((app) => (
                      <option key={app.id} value={app.id} className="bg-[#0e0918] text-white">
                        {app.name} ({app.slug})
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#c4bbd3] pointer-events-none" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-white">Name</label>
                <Input
                  value={newBucket.name}
                  onChange={(e) =>
                    setNewBucket({
                      ...newBucket,
                      name: e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9-]/g, ''),
                    })
                  }
                  placeholder="my-bucket"
                  required
                />
              </div>
              <div className="flex items-center gap-3 p-4 rounded-xl bg-white/[0.03] border border-white/[0.08]">
                <input
                  type="checkbox"
                  id="isPublic"
                  checked={newBucket.isPublic}
                  onChange={(e) =>
                    setNewBucket({ ...newBucket, isPublic: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-white/[0.2] bg-white/[0.05] text-[#ee4f27] focus:ring-[#ee4f27] focus:ring-offset-0"
                />
                <div>
                  <label htmlFor="isPublic" className="text-sm font-medium text-white cursor-pointer">
                    Public bucket
                  </label>
                  <p className="text-xs text-[#c4bbd3]">Files are accessible without authentication</p>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Creating...' : 'Create Bucket'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreateForm(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Buckets Grid */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="relative">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#ee4f27]/30 border-t-[#ee4f27]" />
            <div className="absolute inset-0 h-10 w-10 animate-pulse rounded-full bg-[#ee4f27]/10" />
          </div>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 stagger-children">
          {buckets?.map((bucket: Bucket) => (
            <Link key={bucket.id} href={`/buckets/${bucket.id}`}>
              <Card className="hover:border-[#6b21ef]/30 hover:shadow-[0_0_30px_rgba(107,33,239,0.15)] hover:scale-[1.02] transition-all duration-300 cursor-pointer h-full">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#6b21ef]/20 to-[#6b21ef]/5 border border-white/[0.08]">
                        <FolderOpen className="h-5 w-5 text-[#6b21ef]" />
                      </div>
                      <CardTitle className="text-lg">{bucket.name}</CardTitle>
                    </div>
                    {bucket.isPublic ? (
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                        <Globe className="h-3.5 w-3.5 text-emerald-400" />
                        <span className="text-xs font-medium text-emerald-400">Public</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.05] border border-white/[0.1]">
                        <Lock className="h-3.5 w-3.5 text-[#c4bbd3]" />
                        <span className="text-xs font-medium text-[#c4bbd3]">Private</span>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-[#c4bbd3]">Storage</span>
                        <span className="text-white">
                          {formatBytes(bucket.usedBytes)}
                          {bucket.quotaBytes && (
                            <span className="text-[#c4bbd3]">
                              {' '}/ {formatBytes(bucket.quotaBytes)}
                            </span>
                          )}
                        </span>
                      </div>
                      {bucket.quotaBytes && (
                        <Progress
                          value={(bucket.usedBytes / bucket.quotaBytes) * 100}
                          className="h-2"
                        />
                      )}
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[#c4bbd3] flex items-center gap-2">
                        <Files className="h-4 w-4" />
                        Files
                      </span>
                      <span className="text-white">{bucket.fileCount}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[#c4bbd3]">Created</span>
                      <span className="text-white">{formatDate(bucket.createdAt)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
          {(!buckets || buckets.length === 0) && (
            <div className="col-span-full text-center py-16">
              <FolderOpen className="h-16 w-16 text-[#c4bbd3]/30 mx-auto mb-4" />
              <p className="text-lg font-medium text-white mb-2">No buckets found</p>
              <p className="text-[#c4bbd3]">Create your first bucket to get started.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
