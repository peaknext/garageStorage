'use client';

import { useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/api-client';
import { formatBytes, formatDate } from '@/lib/utils';
import { Plus, Search, Copy, AppWindow, Key, CheckCircle } from 'lucide-react';

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
}

export default function ApplicationsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newApp, setNewApp] = useState({ name: '', slug: '', description: '' });
  const [createdApiKey, setCreatedApiKey] = useState('');
  const [copied, setCopied] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['applications', search],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: Application[] }>('/admin/applications', {
        params: { search, limit: 50 },
      });
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; slug: string; description: string }) => {
      const response = await apiClient.post<{ apiKey: string }>('/admin/applications', data);
      return response.data;
    },
    onSuccess: (data) => {
      setCreatedApiKey(data.apiKey);
      queryClient.invalidateQueries({ queryKey: ['applications'] });
    },
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(newApp);
  };

  const copyApiKey = () => {
    navigator.clipboard.writeText(createdApiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Applications</h1>
          <p className="text-[#c4bbd3] mt-1">
            Manage your tenant applications
          </p>
        </div>
        <Button onClick={() => setShowCreateForm(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Application
        </Button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#c4bbd3]/60" />
          <Input
            placeholder="Search applications..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-11"
          />
        </div>
      </div>

      {/* Create Form Modal */}
      {showCreateForm && (
        <Card className="animate-scale-in">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#ee4f27]/20 to-[#ee4f27]/5 border border-[#ee4f27]/20">
                {createdApiKey ? (
                  <Key className="h-5 w-5 text-[#ee4f27]" />
                ) : (
                  <AppWindow className="h-5 w-5 text-[#ee4f27]" />
                )}
              </div>
              <div>
                <CardTitle>
                  {createdApiKey ? 'Application Created!' : 'Create New Application'}
                </CardTitle>
                <CardDescription>
                  {createdApiKey
                    ? 'Save your API key - it will only be shown once!'
                    : 'Enter details for the new application'}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {createdApiKey ? (
              <div className="space-y-4">
                <div className="rounded-xl bg-[#ee4f27]/10 border border-[#ee4f27]/20 p-4">
                  <p className="text-sm font-medium text-white mb-3">Your API Key:</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-sm bg-black/30 text-[#ee4f27] p-3 rounded-lg font-mono break-all">
                      {createdApiKey}
                    </code>
                    <Button size="icon" variant="outline" onClick={copyApiKey} className="flex-shrink-0">
                      {copied ? <CheckCircle className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <Button
                  onClick={() => {
                    setShowCreateForm(false);
                    setCreatedApiKey('');
                    setNewApp({ name: '', slug: '', description: '' });
                  }}
                >
                  Done
                </Button>
              </div>
            ) : (
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white">Name</label>
                  <Input
                    value={newApp.name}
                    onChange={(e) =>
                      setNewApp({ ...newApp, name: e.target.value })
                    }
                    placeholder="My Application"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white">Slug</label>
                  <Input
                    value={newApp.slug}
                    onChange={(e) =>
                      setNewApp({
                        ...newApp,
                        slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''),
                      })
                    }
                    placeholder="my-application"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white">Description</label>
                  <Input
                    value={newApp.description}
                    onChange={(e) =>
                      setNewApp({ ...newApp, description: e.target.value })
                    }
                    placeholder="Optional description"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? 'Creating...' : 'Create Application'}
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
            )}
          </CardContent>
        </Card>
      )}

      {/* Applications Grid */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="relative">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#ee4f27]/30 border-t-[#ee4f27]" />
            <div className="absolute inset-0 h-10 w-10 animate-pulse rounded-full bg-[#ee4f27]/10" />
          </div>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 stagger-children">
          {data?.data?.map((app: Application) => (
            <Link key={app.id} href={`/applications/${app.id}`}>
              <Card className="hover:border-[#ee4f27]/30 hover:shadow-[0_0_30px_rgba(238,79,39,0.15)] hover:scale-[1.02] transition-all duration-300 cursor-pointer h-full">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#6b21ef]/20 to-[#6b21ef]/5 border border-white/[0.08]">
                        <AppWindow className="h-5 w-5 text-[#6b21ef]" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{app.name}</CardTitle>
                        <CardDescription className="text-xs">{app.slug}</CardDescription>
                      </div>
                    </div>
                    <span
                      className={`text-xs px-3 py-1.5 rounded-full font-medium ${
                        app.status === 'ACTIVE'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-white/[0.05] text-[#c4bbd3] border border-white/[0.1]'
                      }`}
                    >
                      {app.status}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-[#c4bbd3]">Storage</span>
                      <span className="text-white">
                        {formatBytes(app.usedStorageBytes)} /{' '}
                        {formatBytes(app.maxStorageBytes)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#c4bbd3]">Buckets</span>
                      <span className="text-white">{app.bucketCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#c4bbd3]">Created</span>
                      <span className="text-white">{formatDate(app.createdAt)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
          {(!data?.data || data.data.length === 0) && (
            <div className="col-span-full text-center py-16">
              <AppWindow className="h-16 w-16 text-[#c4bbd3]/30 mx-auto mb-4" />
              <p className="text-lg font-medium text-white mb-2">No applications found</p>
              <p className="text-[#c4bbd3]">Create your first application to get started.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
