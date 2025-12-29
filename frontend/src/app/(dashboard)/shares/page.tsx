'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import {
  Link2,
  Search,
  Trash2,
  Clock,
  Download,
  Lock,
  Eye,
  Copy,
  CheckCircle,
  AlertCircle,
  Filter,
} from 'lucide-react';

interface Share {
  id: string;
  token: string;
  shareUrl: string;
  expiresAt: string | null;
  maxDownloads: number | null;
  downloadCount: number;
  hasPassword: boolean;
  allowPreview: boolean;
  createdAt: string;
  isExpired: boolean;
  file: {
    id: string;
    name: string;
    mimeType: string;
    sizeBytes: number;
    bucket: string;
    application: string;
  };
}

interface SharesResponse {
  data: Share[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export default function SharesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'expired'>('all');
  const [page, setPage] = useState(1);
  const [copied, setCopied] = useState<string | null>(null);
  const [revokeShareId, setRevokeShareId] = useState<string | null>(null);
  const limit = 20;

  const { data, isLoading } = useQuery({
    queryKey: ['shares', page, limit],
    queryFn: async () => {
      const { data } = await apiClient.get<SharesResponse>('/admin/shares', {
        params: { page, limit },
      });
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (shareId: string) => {
      await apiClient.delete(`/admin/shares/${shareId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shares'] });
    },
  });

  const copyLink = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const filteredShares = data?.data.filter((share) => {
    const matchesSearch = search
      ? share.file.name.toLowerCase().includes(search.toLowerCase())
      : true;

    if (!matchesSearch) return false;

    if (filter === 'all') return true;

    const isExpired = share.expiresAt && new Date(share.expiresAt) < new Date();
    const limitReached = share.maxDownloads && share.downloadCount >= share.maxDownloads;
    const isActive = !isExpired && !limitReached;

    return filter === 'active' ? isActive : !isActive;
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-[#6b21ef]/20 to-[#6b21ef]/5 border border-white/[0.08]">
            <Link2 className="h-7 w-7 text-[#6b21ef]" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Share Links</h1>
            <p className="text-[#c4bbd3]">Manage all file share links</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#c4bbd3]/60" />
          <Input
            placeholder="Search by file name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-11"
          />
        </div>
        <div className="flex items-center gap-2 p-1 rounded-xl bg-white/[0.02] border border-white/[0.08]">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 text-sm rounded-lg transition-all ${
              filter === 'all'
                ? 'bg-[#6b21ef]/20 text-white border border-[#6b21ef]/30'
                : 'text-[#c4bbd3] hover:text-white'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('active')}
            className={`px-4 py-2 text-sm rounded-lg transition-all ${
              filter === 'active'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'text-[#c4bbd3] hover:text-white'
            }`}
          >
            Active
          </button>
          <button
            onClick={() => setFilter('expired')}
            className={`px-4 py-2 text-sm rounded-lg transition-all ${
              filter === 'expired'
                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                : 'text-[#c4bbd3] hover:text-white'
            }`}
          >
            Expired
          </button>
        </div>
      </div>

      {/* Shares List */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#6b21ef]/20 to-[#6b21ef]/5 border border-white/[0.08]">
              <Link2 className="h-5 w-5 text-[#6b21ef]" />
            </div>
            <div>
              <CardTitle>All Share Links</CardTitle>
              <CardDescription>
                {data?.pagination.total || 0} share links across all files
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#ee4f27]/30 border-t-[#ee4f27]" />
            </div>
          ) : filteredShares?.length === 0 ? (
            <div className="py-12 text-center">
              <Link2 className="h-12 w-12 text-[#c4bbd3]/30 mx-auto mb-3" />
              <p className="text-[#c4bbd3]">
                {search || filter !== 'all' ? 'No shares match your filters' : 'No share links created yet'}
              </p>
              <p className="text-sm text-[#c4bbd3]/60 mt-1">
                Create share links from the bucket file management page
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredShares?.map((share) => {
                const isExpired = share.expiresAt && new Date(share.expiresAt) < new Date();
                const limitReached = share.maxDownloads && share.downloadCount >= share.maxDownloads;
                const isActive = !isExpired && !limitReached;

                return (
                  <div
                    key={share.id}
                    className={`p-4 rounded-xl border transition-all ${
                      isActive
                        ? 'bg-white/[0.02] border-white/[0.08]'
                        : 'bg-red-500/5 border-red-500/20'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <h4 className="font-medium text-white truncate">
                            {share.file.name}
                          </h4>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${
                              isActive
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-red-500/10 text-red-400 border border-red-500/20'
                            }`}
                          >
                            {isActive ? 'Active' : isExpired ? 'Expired' : 'Limit Reached'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mb-3">
                          <code className="text-sm text-[#c4bbd3]/70 bg-black/30 px-2 py-1 rounded truncate flex-1">
                            {share.shareUrl}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 flex-shrink-0"
                            onClick={() => copyLink(share.shareUrl, share.id)}
                          >
                            {copied === share.id ? (
                              <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                        <div className="flex flex-wrap items-center gap-4 text-xs text-[#c4bbd3]/60">
                          <span className="flex items-center gap-1">
                            <Filter className="h-3 w-3" />
                            {share.file.bucket}
                          </span>
                          {share.expiresAt && (
                            <span className={`flex items-center gap-1 ${isExpired ? 'text-red-400' : ''}`}>
                              <Clock className="h-3 w-3" />
                              {isExpired ? 'Expired' : `Expires ${formatDate(share.expiresAt)}`}
                            </span>
                          )}
                          {share.maxDownloads && (
                            <span className={`flex items-center gap-1 ${limitReached ? 'text-red-400' : ''}`}>
                              <Download className="h-3 w-3" />
                              {share.downloadCount}/{share.maxDownloads} downloads
                            </span>
                          )}
                          {!share.maxDownloads && share.downloadCount > 0 && (
                            <span className="flex items-center gap-1">
                              <Download className="h-3 w-3" />
                              {share.downloadCount} downloads
                            </span>
                          )}
                          {share.hasPassword && (
                            <span className="flex items-center gap-1">
                              <Lock className="h-3 w-3" />
                              Password protected
                            </span>
                          )}
                          {share.allowPreview && (
                            <span className="flex items-center gap-1">
                              <Eye className="h-3 w-3" />
                              Preview enabled
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Created {formatDate(share.createdAt)}
                          </span>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-400 hover:bg-red-500/10"
                        onClick={() => setRevokeShareId(share.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {data && data.pagination.totalPages > 1 && (
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
                Page {page} of {data.pagination.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
                disabled={page === data.pagination.totalPages}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Revoke Confirmation Dialog */}
      <AlertDialog
        open={!!revokeShareId}
        onOpenChange={(open) => !open && setRevokeShareId(null)}
        title="Revoke share link?"
        description="This will permanently disable the share link. Anyone with the link will no longer be able to access the file."
        variant="destructive"
        confirmLabel="Revoke"
        onConfirm={() => {
          if (revokeShareId) {
            deleteMutation.mutate(revokeShareId);
            setRevokeShareId(null);
          }
        }}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
