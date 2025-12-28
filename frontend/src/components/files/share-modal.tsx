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
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import {
  X,
  Link2,
  Copy,
  CheckCircle,
  Trash2,
  Clock,
  Download,
  Lock,
  Eye,
  Share2,
} from 'lucide-react';

interface ShareModalProps {
  fileId: string;
  fileName: string;
  onClose: () => void;
}

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
}

const EXPIRATION_OPTIONS = [
  { label: '1 hour', value: 3600 },
  { label: '1 day', value: 86400 },
  { label: '7 days', value: 604800 },
  { label: '30 days', value: 2592000 },
  { label: 'Never', value: 0 },
];

export function ShareModal({ fileId, fileName, onClose }: ShareModalProps) {
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [expiresIn, setExpiresIn] = useState(604800); // 7 days default
  const [maxDownloads, setMaxDownloads] = useState('');
  const [password, setPassword] = useState('');
  const [allowPreview, setAllowPreview] = useState(true);

  const { data: shares, isLoading } = useQuery({
    queryKey: ['file-shares', fileId],
    queryFn: async () => {
      const { data } = await apiClient.get<Share[]>(`/admin/files/${fileId}/shares`);
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload: any = { allowPreview };
      if (expiresIn > 0) payload.expiresIn = expiresIn;
      if (maxDownloads) payload.maxDownloads = parseInt(maxDownloads, 10);
      if (password) payload.password = password;

      const { data } = await apiClient.post<Share>(`/admin/files/${fileId}/shares`, payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['file-shares', fileId] });
      setShowCreateForm(false);
      setMaxDownloads('');
      setPassword('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (shareId: string) => {
      await apiClient.delete(`/admin/files/${fileId}/shares/${shareId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['file-shares', fileId] });
    },
  });

  const copyLink = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <Card className="animate-scale-in max-w-2xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#6b21ef]/20 to-[#6b21ef]/5 border border-[#6b21ef]/20">
              <Share2 className="h-5 w-5 text-[#6b21ef]" />
            </div>
            <div>
              <CardTitle>Share File</CardTitle>
              <CardDescription className="truncate max-w-xs">
                {fileName}
              </CardDescription>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Create New Share */}
        {showCreateForm ? (
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.08] space-y-4">
            <h4 className="text-sm font-medium text-white">Create Share Link</h4>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm text-[#c4bbd3]">Expires</label>
                <select
                  value={expiresIn}
                  onChange={(e) => setExpiresIn(parseInt(e.target.value, 10))}
                  className="w-full h-11 px-4 rounded-xl bg-white/[0.03] border border-white/[0.1] text-white text-sm focus:border-[#ee4f27] focus:ring-1 focus:ring-[#ee4f27] outline-none"
                >
                  {EXPIRATION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value} className="bg-[#0e0918]">
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm text-[#c4bbd3]">Max Downloads</label>
                <Input
                  type="number"
                  placeholder="Unlimited"
                  value={maxDownloads}
                  onChange={(e) => setMaxDownloads(e.target.value)}
                  min="1"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-[#c4bbd3]">Password (optional)</label>
              <Input
                type="password"
                placeholder="Leave empty for no password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="allowPreview"
                checked={allowPreview}
                onChange={(e) => setAllowPreview(e.target.checked)}
                className="h-4 w-4 rounded border-white/20 bg-white/[0.05] text-[#ee4f27] focus:ring-[#ee4f27]"
              />
              <label htmlFor="allowPreview" className="text-sm text-white">
                Allow preview in browser
              </label>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setShowCreateForm(false)}>
                Cancel
              </Button>
              <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating...' : 'Create Link'}
              </Button>
            </div>
          </div>
        ) : (
          <Button onClick={() => setShowCreateForm(true)} className="w-full">
            <Link2 className="mr-2 h-4 w-4" />
            Create New Share Link
          </Button>
        )}

        {/* Existing Shares */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-[#c4bbd3]">
            Active Share Links ({shares?.length || 0})
          </h4>

          {isLoading ? (
            <div className="py-8 flex justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#ee4f27]/30 border-t-[#ee4f27]" />
            </div>
          ) : shares?.length === 0 ? (
            <div className="py-8 text-center">
              <Link2 className="h-10 w-10 text-[#c4bbd3]/30 mx-auto mb-2" />
              <p className="text-sm text-[#c4bbd3]">No share links created yet</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {shares?.map((share) => {
                const isExpired = share.expiresAt && new Date(share.expiresAt) < new Date();
                const limitReached = share.maxDownloads && share.downloadCount >= share.maxDownloads;

                return (
                  <div
                    key={share.id}
                    className={`p-3 rounded-xl border ${
                      isExpired || limitReached
                        ? 'bg-red-500/5 border-red-500/20'
                        : 'bg-white/[0.02] border-white/[0.08]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <code className="text-xs text-[#c4bbd3]/70 bg-black/30 px-2 py-1 rounded truncate">
                            {share.shareUrl}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 flex-shrink-0"
                            onClick={() => copyLink(share.shareUrl, share.id)}
                          >
                            {copied === share.id ? (
                              <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-[#c4bbd3]/60">
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
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-400 hover:bg-red-500/10"
                        onClick={() => {
                          if (confirm('Revoke this share link?')) {
                            deleteMutation.mutate(share.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Close Button */}
        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
