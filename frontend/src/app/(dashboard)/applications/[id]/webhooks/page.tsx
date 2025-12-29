'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
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
  ArrowLeft,
  Webhook,
  Plus,
  Trash2,
  Edit2,
  Play,
  CheckCircle,
  AlertCircle,
  Clock,
  X,
  Globe,
} from 'lucide-react';
import { useState } from 'react';

interface WebhookItem {
  id: string;
  name: string;
  url: string;
  events: string[];
  isActive: boolean;
  secret: string;
  failureCount: number;
  lastTriggeredAt: string | null;
  createdAt: string;
}

interface Application {
  id: string;
  name: string;
  slug: string;
}

const AVAILABLE_EVENTS = [
  { value: 'file.uploaded', label: 'File Uploaded' },
  { value: 'file.deleted', label: 'File Deleted' },
  { value: 'file.downloaded', label: 'File Downloaded' },
  { value: 'file.copied', label: 'File Copied' },
  { value: 'file.moved', label: 'File Moved' },
  { value: 'bucket.created', label: 'Bucket Created' },
  { value: 'bucket.deleted', label: 'Bucket Deleted' },
  { value: 'share.created', label: 'Share Created' },
  { value: 'share.accessed', label: 'Share Accessed' },
  { value: 'quota.warning', label: 'Quota Warning' },
  { value: 'quota.critical', label: 'Quota Critical' },
];

export default function WebhooksPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<WebhookItem | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);

  const { data: app } = useQuery({
    queryKey: ['application', params.id],
    queryFn: async () => {
      const { data } = await apiClient.get<Application>(`/admin/applications/${params.id}`);
      return data;
    },
  });

  const { data: webhooks, isLoading } = useQuery({
    queryKey: ['application-webhooks', params.id],
    queryFn: async () => {
      const { data } = await apiClient.get<WebhookItem[]>(`/admin/applications/${params.id}/webhooks`);
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = { name, url, events, isActive };
      const { data } = await apiClient.post<WebhookItem>(`/admin/applications/${params.id}/webhooks`, payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['application-webhooks', params.id] });
      resetForm();
      setShowCreateForm(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (webhookId: string) => {
      const payload = { name, url, events, isActive };
      const { data } = await apiClient.patch<WebhookItem>(
        `/admin/applications/${params.id}/webhooks/${webhookId}`,
        payload
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['application-webhooks', params.id] });
      resetForm();
      setEditingWebhook(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (webhookId: string) => {
      await apiClient.delete(`/admin/applications/${params.id}/webhooks/${webhookId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['application-webhooks', params.id] });
    },
  });

  const testMutation = useMutation({
    mutationFn: async (webhookId: string) => {
      const { data } = await apiClient.post(`/admin/applications/${params.id}/webhooks/${webhookId}/test`);
      return data;
    },
  });

  const resetForm = () => {
    setName('');
    setUrl('');
    setEvents([]);
    setIsActive(true);
  };

  const startEdit = (webhook: WebhookItem) => {
    setEditingWebhook(webhook);
    setName(webhook.name);
    setUrl(webhook.url);
    setEvents(webhook.events);
    setIsActive(webhook.isActive);
  };

  const cancelEdit = () => {
    setEditingWebhook(null);
    resetForm();
  };

  const toggleEvent = (event: string) => {
    setEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  };

  const handleSubmit = () => {
    if (editingWebhook) {
      updateMutation.mutate(editingWebhook.id);
    } else {
      createMutation.mutate();
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/applications/${params.id}`}>
            <Button variant="ghost" size="icon" className="h-10 w-10">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-[#6b21ef]/20 to-[#6b21ef]/5 border border-white/[0.08]">
              <Webhook className="h-7 w-7 text-[#6b21ef]" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white tracking-tight">Webhooks</h1>
              <p className="text-[#c4bbd3]">{app?.name || 'Application'}</p>
            </div>
          </div>
        </div>
        {!showCreateForm && !editingWebhook && (
          <Button onClick={() => setShowCreateForm(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Webhook
          </Button>
        )}
      </div>

      {/* Create/Edit Form */}
      {(showCreateForm || editingWebhook) && (
        <Card className="animate-scale-in">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#6b21ef]/20 to-[#6b21ef]/5 border border-[#6b21ef]/20">
                  <Webhook className="h-5 w-5 text-[#6b21ef]" />
                </div>
                <div>
                  <CardTitle>{editingWebhook ? 'Edit Webhook' : 'Create Webhook'}</CardTitle>
                  <CardDescription>
                    {editingWebhook ? 'Update webhook configuration' : 'Set up a new webhook endpoint'}
                  </CardDescription>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setShowCreateForm(false);
                  cancelEdit();
                }}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm text-[#c4bbd3]">Name</label>
                <Input
                  placeholder="My Webhook"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-[#c4bbd3]">Endpoint URL</label>
                <Input
                  placeholder="https://api.example.com/webhook"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-[#c4bbd3]">Events</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {AVAILABLE_EVENTS.map((event) => (
                  <button
                    key={event.value}
                    type="button"
                    onClick={() => toggleEvent(event.value)}
                    className={`px-3 py-2 text-sm rounded-lg border transition-all ${
                      events.includes(event.value)
                        ? 'bg-[#6b21ef]/20 border-[#6b21ef]/40 text-white'
                        : 'bg-white/[0.02] border-white/[0.08] text-[#c4bbd3] hover:border-white/[0.15]'
                    }`}
                  >
                    {event.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.08]">
              <input
                type="checkbox"
                id="isActive"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-white/20 bg-white/[0.05] text-[#ee4f27] focus:ring-[#ee4f27]"
              />
              <label htmlFor="isActive" className="text-sm text-white">
                Enable webhook (receives events when active)
              </label>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowCreateForm(false);
                  cancelEdit();
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={
                  !name || !url || events.length === 0 ||
                  createMutation.isPending || updateMutation.isPending
                }
              >
                {createMutation.isPending || updateMutation.isPending
                  ? 'Saving...'
                  : editingWebhook
                  ? 'Update Webhook'
                  : 'Create Webhook'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Webhooks List */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#6b21ef]/20 to-[#6b21ef]/5 border border-white/[0.08]">
              <Globe className="h-5 w-5 text-[#6b21ef]" />
            </div>
            <div>
              <CardTitle>Configured Webhooks</CardTitle>
              <CardDescription>{webhooks?.length || 0} webhooks configured</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#ee4f27]/30 border-t-[#ee4f27]" />
            </div>
          ) : webhooks?.length === 0 ? (
            <div className="py-12 text-center">
              <Webhook className="h-12 w-12 text-[#c4bbd3]/30 mx-auto mb-3" />
              <p className="text-[#c4bbd3]">No webhooks configured yet</p>
              <p className="text-sm text-[#c4bbd3]/60 mt-1">
                Create a webhook to receive event notifications
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {webhooks?.map((webhook) => (
                <div
                  key={webhook.id}
                  className={`p-4 rounded-xl border transition-all ${
                    webhook.isActive
                      ? 'bg-white/[0.02] border-white/[0.08]'
                      : 'bg-white/[0.01] border-white/[0.04] opacity-60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <h4 className="font-medium text-white">{webhook.name}</h4>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            webhook.isActive
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-white/[0.05] text-[#c4bbd3] border border-white/[0.1]'
                          }`}
                        >
                          {webhook.isActive ? 'Active' : 'Inactive'}
                        </span>
                        {webhook.failureCount > 0 && (
                          <span className="flex items-center gap-1 text-xs text-red-400">
                            <AlertCircle className="h-3 w-3" />
                            {webhook.failureCount} failures
                          </span>
                        )}
                      </div>
                      <code className="text-sm text-[#c4bbd3]/70 bg-black/30 px-2 py-1 rounded truncate block">
                        {webhook.url}
                      </code>
                      <div className="flex flex-wrap gap-2 mt-3">
                        {webhook.events.map((event) => (
                          <span
                            key={event}
                            className="text-xs px-2 py-1 rounded bg-[#6b21ef]/10 text-[#6b21ef] border border-[#6b21ef]/20"
                          >
                            {event}
                          </span>
                        ))}
                      </div>
                      <div className="flex items-center gap-4 mt-3 text-xs text-[#c4bbd3]/60">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Created {formatDate(webhook.createdAt)}
                        </span>
                        {webhook.lastTriggeredAt && (
                          <span className="flex items-center gap-1">
                            <CheckCircle className="h-3 w-3" />
                            Last triggered {formatDate(webhook.lastTriggeredAt)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => testMutation.mutate(webhook.id)}
                        disabled={testMutation.isPending}
                        title="Send test event"
                      >
                        <Play className={`h-4 w-4 ${testMutation.isPending ? 'animate-pulse' : ''}`} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => startEdit(webhook)}
                        title="Edit webhook"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-400 hover:bg-red-500/10"
                        onClick={() => {
                          if (confirm('Delete this webhook?')) {
                            deleteMutation.mutate(webhook.id);
                          }
                        }}
                        title="Delete webhook"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
