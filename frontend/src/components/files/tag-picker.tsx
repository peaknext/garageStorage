'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import {
  Tag,
  Plus,
  X,
  Check,
  Loader2,
  Search,
} from 'lucide-react';

interface TagItem {
  id: string;
  name: string;
  color: string | null;
}

interface TagPickerProps {
  fileId: string;
  bucketId: string;
  applicationId: string;
  onClose: () => void;
  position: { top: number; left: number };
}

export function TagPicker({ fileId, bucketId, applicationId, onClose, position }: TagPickerProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Fetch all available tags for the application
  const { data: availableTags, isLoading: tagsLoading } = useQuery({
    queryKey: ['app-tags', applicationId],
    queryFn: async () => {
      const { data } = await apiClient.get<TagItem[]>(`/admin/applications/${applicationId}/tags`);
      return data;
    },
    enabled: !!applicationId,
  });

  // Fetch tags already on this file
  const { data: fileTags, isLoading: fileTagsLoading } = useQuery({
    queryKey: ['file-tags', bucketId, fileId],
    queryFn: async () => {
      const { data } = await apiClient.get<TagItem[]>(
        `/admin/buckets/${bucketId}/files/${fileId}/tags`
      );
      return data;
    },
  });

  const addTagMutation = useMutation({
    mutationFn: async (tagIds: string[]) => {
      await apiClient.post(`/admin/buckets/${bucketId}/files/${fileId}/tags`, { tagIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['file-tags', bucketId, fileId] });
      queryClient.invalidateQueries({ queryKey: ['bucket-files', bucketId] });
      toast({ title: 'Tag added', variant: 'success' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to add tag', description: error.message, variant: 'destructive' });
    },
  });

  const removeTagMutation = useMutation({
    mutationFn: async (tagId: string) => {
      await apiClient.delete(`/admin/buckets/${bucketId}/files/${fileId}/tags/${tagId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['file-tags', bucketId, fileId] });
      queryClient.invalidateQueries({ queryKey: ['bucket-files', bucketId] });
      toast({ title: 'Tag removed', variant: 'success' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to remove tag', description: error.message, variant: 'destructive' });
    },
  });

  const fileTagIds = new Set(fileTags?.map((t) => t.id) || []);
  const filteredTags = availableTags?.filter(
    (tag) => tag.name.toLowerCase().includes(search.toLowerCase())
  ) || [];

  const isLoading = tagsLoading || fileTagsLoading;

  if (!mounted) return null;

  const picker = (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[9998]" onClick={onClose} />

      {/* Picker */}
      <div
        ref={containerRef}
        className="fixed z-[9999] w-64 rounded-xl bg-[#1a1025] border border-white/[0.1] shadow-2xl overflow-hidden"
        style={{ top: position.top, left: position.left }}
      >
        {/* Header */}
        <div className="p-3 border-b border-white/[0.08]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#c4bbd3]/60" />
            <Input
              placeholder="Search tags..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-sm"
              autoFocus
            />
          </div>
        </div>

        {/* Tags List */}
        <div className="max-h-64 overflow-y-auto p-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 text-[#ee4f27] animate-spin" />
            </div>
          ) : filteredTags.length === 0 ? (
            <div className="py-6 text-center">
              <Tag className="h-8 w-8 text-[#c4bbd3]/30 mx-auto mb-2" />
              <p className="text-sm text-[#c4bbd3]">
                {search ? 'No matching tags' : 'No tags available'}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredTags.map((tag) => {
                const isSelected = fileTagIds.has(tag.id);
                const isPending =
                  (addTagMutation.isPending && addTagMutation.variables?.includes(tag.id)) ||
                  (removeTagMutation.isPending && removeTagMutation.variables === tag.id);

                return (
                  <button
                    key={tag.id}
                    onClick={() => {
                      if (isSelected) {
                        removeTagMutation.mutate(tag.id);
                      } else {
                        addTagMutation.mutate([tag.id]);
                      }
                    }}
                    disabled={isPending}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                      isSelected
                        ? 'bg-white/[0.08] text-white'
                        : 'text-[#c4bbd3] hover:bg-white/[0.05] hover:text-white'
                    }`}
                  >
                    <div
                      className="h-3 w-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: tag.color || '#6b7280' }}
                    />
                    <span className="flex-1 text-left truncate">{tag.name}</span>
                    {isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : isSelected ? (
                      <Check className="h-4 w-4 text-emerald-400" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Current Tags */}
        {fileTags && fileTags.length > 0 && (
          <div className="p-3 border-t border-white/[0.08] bg-white/[0.02]">
            <p className="text-xs text-[#c4bbd3] mb-2">Selected tags:</p>
            <div className="flex flex-wrap gap-1">
              {fileTags.map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                  style={{
                    backgroundColor: `${tag.color || '#6b7280'}20`,
                    color: tag.color || '#6b7280',
                    borderColor: `${tag.color || '#6b7280'}40`,
                    borderWidth: 1,
                  }}
                >
                  {tag.name}
                  <button
                    onClick={() => removeTagMutation.mutate(tag.id)}
                    className="hover:bg-white/10 rounded-full p-0.5"
                    disabled={removeTagMutation.isPending}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );

  return createPortal(picker, document.body);
}
