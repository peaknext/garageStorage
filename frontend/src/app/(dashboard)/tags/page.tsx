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
import { useToast } from '@/hooks/use-toast';
import {
  Tag,
  Plus,
  Pencil,
  Trash2,
  Files,
  ChevronDown,
  ChevronRight,
  X,
  Check,
  Palette,
} from 'lucide-react';

interface Application {
  id: string;
  name: string;
  slug: string;
}

interface TagItem {
  id: string;
  name: string;
  color: string | null;
  applicationId: string;
  createdAt: string;
  _count: {
    files: number;
  };
}

const TAG_COLORS = [
  { name: 'Red', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Lime', value: '#84cc16' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Emerald', value: '#10b981' },
  { name: 'Teal', value: '#14b8a6' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Sky', value: '#0ea5e9' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Violet', value: '#8b5cf6' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Fuchsia', value: '#d946ef' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Rose', value: '#f43f5e' },
  { name: 'Gray', value: '#6b7280' },
];

export default function TagsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [expandedApps, setExpandedApps] = useState<Set<string>>(new Set());
  const [showCreateForm, setShowCreateForm] = useState<string | null>(null);
  const [editingTag, setEditingTag] = useState<TagItem | null>(null);
  const [deleteTag, setDeleteTag] = useState<TagItem | null>(null);
  const [newTag, setNewTag] = useState({ name: '', color: '#6366f1' });
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [editShowColorPicker, setEditShowColorPicker] = useState(false);

  // Fetch applications
  const { data: applications, isLoading: appsLoading } = useQuery({
    queryKey: ['applications'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: Application[] }>('/admin/applications', {
        params: { limit: 100 },
      });
      return data.data;
    },
  });

  // Fetch tags for all applications
  const { data: tagsData, isLoading: tagsLoading } = useQuery({
    queryKey: ['all-tags', applications],
    queryFn: async () => {
      const apps = applications || [];
      const allTags: Record<string, TagItem[]> = {};

      for (const app of apps) {
        const { data } = await apiClient.get<TagItem[]>(`/admin/applications/${app.id}/tags`);
        allTags[app.id] = data;
      }

      return allTags;
    },
    enabled: !!applications?.length,
  });

  const createMutation = useMutation({
    mutationFn: async ({ appId, tag }: { appId: string; tag: { name: string; color: string } }) => {
      await apiClient.post(`/admin/applications/${appId}/tags`, tag);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-tags'] });
      setShowCreateForm(null);
      setNewTag({ name: '', color: '#6366f1' });
      toast({ title: 'Tag created', variant: 'success' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to create tag', description: error.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { name?: string; color?: string } }) => {
      await apiClient.patch(`/admin/tags/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-tags'] });
      setEditingTag(null);
      toast({ title: 'Tag updated', variant: 'success' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update tag', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/admin/tags/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-tags'] });
      setDeleteTag(null);
      toast({ title: 'Tag deleted', variant: 'success' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to delete tag', description: error.message, variant: 'destructive' });
    },
  });

  const toggleApp = (appId: string) => {
    const newExpanded = new Set(expandedApps);
    if (newExpanded.has(appId)) {
      newExpanded.delete(appId);
    } else {
      newExpanded.add(appId);
    }
    setExpandedApps(newExpanded);
  };

  const handleCreateTag = (appId: string) => {
    if (!newTag.name.trim()) return;
    createMutation.mutate({ appId, tag: newTag });
  };

  const handleUpdateTag = () => {
    if (!editingTag) return;
    updateMutation.mutate({
      id: editingTag.id,
      data: { name: editingTag.name, color: editingTag.color || undefined },
    });
  };

  const isLoading = appsLoading || tagsLoading;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Tags</h1>
        <p className="text-[#c4bbd3] mt-1">Organize files with tags across your applications</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="relative">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#ee4f27]/30 border-t-[#ee4f27]" />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {applications?.map((app) => {
            const appTags = tagsData?.[app.id] || [];
            const isExpanded = expandedApps.has(app.id);

            return (
              <Card key={app.id} className="overflow-hidden">
                <CardHeader
                  className="cursor-pointer hover:bg-white/[0.02] transition-colors"
                  onClick={() => toggleApp(app.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isExpanded ? (
                        <ChevronDown className="h-5 w-5 text-[#c4bbd3]" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-[#c4bbd3]" />
                      )}
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#6b21ef]/20 to-[#6b21ef]/5 border border-white/[0.08]">
                        <Tag className="h-5 w-5 text-[#6b21ef]" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{app.name}</CardTitle>
                        <CardDescription>{appTags.length} tag{appTags.length !== 1 ? 's' : ''}</CardDescription>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowCreateForm(app.id);
                        if (!isExpanded) toggleApp(app.id);
                      }}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add Tag
                    </Button>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="pt-0">
                    {/* Create Tag Form */}
                    {showCreateForm === app.id && (
                      <div className="mb-4 p-4 rounded-xl bg-white/[0.03] border border-white/[0.08]">
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setShowColorPicker(!showColorPicker)}
                              className="h-10 w-10 rounded-lg border border-white/[0.1] flex items-center justify-center"
                              style={{ backgroundColor: newTag.color }}
                            >
                              <Palette className="h-4 w-4 text-white" />
                            </button>
                            {showColorPicker && (
                              <div className="absolute top-12 left-0 z-10 p-2 rounded-xl bg-[#1a1025] border border-white/[0.1] shadow-xl grid grid-cols-6 gap-1">
                                {TAG_COLORS.map((color) => (
                                  <button
                                    key={color.value}
                                    onClick={() => {
                                      setNewTag({ ...newTag, color: color.value });
                                      setShowColorPicker(false);
                                    }}
                                    className="h-6 w-6 rounded-md hover:scale-110 transition-transform"
                                    style={{ backgroundColor: color.value }}
                                    title={color.name}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                          <Input
                            placeholder="Tag name..."
                            value={newTag.name}
                            onChange={(e) => setNewTag({ ...newTag, name: e.target.value })}
                            className="flex-1"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleCreateTag(app.id);
                            }}
                          />
                          <Button
                            size="sm"
                            onClick={() => handleCreateTag(app.id)}
                            disabled={!newTag.name.trim() || createMutation.isPending}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setShowCreateForm(null);
                              setNewTag({ name: '', color: '#6366f1' });
                              setShowColorPicker(false);
                            }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Tags List */}
                    {appTags.length === 0 ? (
                      <div className="py-8 text-center">
                        <Tag className="h-10 w-10 text-[#c4bbd3]/30 mx-auto mb-3" />
                        <p className="text-[#c4bbd3]">No tags yet</p>
                        <p className="text-sm text-[#c4bbd3]/60 mt-1">
                          Create tags to organize files in this application
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {appTags.map((tag) => (
                          <div
                            key={tag.id}
                            className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] transition-colors"
                          >
                            {editingTag?.id === tag.id ? (
                              // Edit mode
                              <div className="flex items-center gap-3 flex-1">
                                <div className="relative">
                                  <button
                                    type="button"
                                    onClick={() => setEditShowColorPicker(!editShowColorPicker)}
                                    className="h-8 w-8 rounded-lg border border-white/[0.1] flex items-center justify-center"
                                    style={{ backgroundColor: editingTag.color || '#6b7280' }}
                                  >
                                    <Palette className="h-3 w-3 text-white" />
                                  </button>
                                  {editShowColorPicker && (
                                    <div className="absolute top-10 left-0 z-10 p-2 rounded-xl bg-[#1a1025] border border-white/[0.1] shadow-xl grid grid-cols-6 gap-1">
                                      {TAG_COLORS.map((color) => (
                                        <button
                                          key={color.value}
                                          onClick={() => {
                                            setEditingTag({ ...editingTag, color: color.value });
                                            setEditShowColorPicker(false);
                                          }}
                                          className="h-6 w-6 rounded-md hover:scale-110 transition-transform"
                                          style={{ backgroundColor: color.value }}
                                          title={color.name}
                                        />
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <Input
                                  value={editingTag.name}
                                  onChange={(e) => setEditingTag({ ...editingTag, name: e.target.value })}
                                  className="flex-1 h-8"
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleUpdateTag();
                                    if (e.key === 'Escape') setEditingTag(null);
                                  }}
                                  autoFocus
                                />
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0"
                                  onClick={handleUpdateTag}
                                  disabled={updateMutation.isPending}
                                >
                                  <Check className="h-4 w-4 text-emerald-400" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0"
                                  onClick={() => {
                                    setEditingTag(null);
                                    setEditShowColorPicker(false);
                                  }}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              // View mode
                              <>
                                <div className="flex items-center gap-3">
                                  <div
                                    className="h-3 w-3 rounded-full"
                                    style={{ backgroundColor: tag.color || '#6b7280' }}
                                  />
                                  <span className="text-white font-medium">{tag.name}</span>
                                  <span className="flex items-center gap-1 text-sm text-[#c4bbd3]">
                                    <Files className="h-3.5 w-3.5" />
                                    {tag._count.files}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 w-8 p-0"
                                    onClick={() => setEditingTag(tag)}
                                  >
                                    <Pencil className="h-4 w-4 text-[#c4bbd3]" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 w-8 p-0 hover:bg-red-500/10"
                                    onClick={() => setDeleteTag(tag)}
                                  >
                                    <Trash2 className="h-4 w-4 text-red-400" />
                                  </Button>
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}

          {(!applications || applications.length === 0) && (
            <div className="text-center py-16">
              <Tag className="h-16 w-16 text-[#c4bbd3]/30 mx-auto mb-4" />
              <p className="text-lg font-medium text-white mb-2">No applications found</p>
              <p className="text-[#c4bbd3]">Create an application first to start adding tags.</p>
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deleteTag}
        onOpenChange={(open) => !open && setDeleteTag(null)}
        title={`Delete tag "${deleteTag?.name}"?`}
        description={`This will remove the tag from ${deleteTag?._count.files || 0} file(s). This action cannot be undone.`}
        variant="destructive"
        confirmLabel="Delete"
        onConfirm={() => deleteTag && deleteMutation.mutate(deleteTag.id)}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
