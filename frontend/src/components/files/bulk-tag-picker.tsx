'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import {
  Tag,
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

interface BulkTagPickerProps {
  fileIds: string[];
  bucketId: string;
  applicationId: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export function BulkTagPicker({ fileIds, bucketId, applicationId, onClose, onSuccess }: BulkTagPickerProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

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

  const bulkTagMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post('/admin/tags/bulk', {
        fileIds: Array.from(fileIds),
        tagIds: Array.from(selectedTags),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bucket-files', bucketId] });
      toast({
        title: 'Tags added',
        description: `Added ${selectedTags.size} tag(s) to ${fileIds.length} file(s)`,
        variant: 'success',
      });
      onSuccess?.();
      onClose();
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to add tags', description: error.message, variant: 'destructive' });
    },
  });

  const toggleTag = (tagId: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) {
        next.delete(tagId);
      } else {
        next.add(tagId);
      }
      return next;
    });
  };

  const filteredTags = availableTags?.filter(
    (tag) => tag.name.toLowerCase().includes(search.toLowerCase())
  ) || [];

  if (!mounted) return null;

  const modal = (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md rounded-xl bg-[#1a1025] border border-white/[0.1] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#6b21ef]/20 to-[#6b21ef]/5 border border-[#6b21ef]/20">
              <Tag className="h-5 w-5 text-[#6b21ef]" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Add Tags</h3>
              <p className="text-sm text-[#c4bbd3]">
                {fileIds.length} file{fileIds.length !== 1 ? 's' : ''} selected
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-white/[0.08]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#c4bbd3]/60" />
            <Input
              placeholder="Search tags..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>
        </div>

        {/* Tags List */}
        <div className="max-h-64 overflow-y-auto p-4">
          {tagsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 text-[#ee4f27] animate-spin" />
            </div>
          ) : filteredTags.length === 0 ? (
            <div className="py-8 text-center">
              <Tag className="h-10 w-10 text-[#c4bbd3]/30 mx-auto mb-3" />
              <p className="text-[#c4bbd3]">
                {search ? 'No matching tags' : 'No tags available'}
              </p>
              <p className="text-sm text-[#c4bbd3]/60 mt-1">
                Create tags in the Tags page first
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {filteredTags.map((tag) => {
                const isSelected = selectedTags.has(tag.id);
                return (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag(tag.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
                      isSelected
                        ? 'bg-[#6b21ef]/20 border border-[#6b21ef]/40 text-white'
                        : 'bg-white/[0.02] border border-white/[0.08] text-[#c4bbd3] hover:bg-white/[0.05] hover:border-white/[0.15]'
                    }`}
                  >
                    <div
                      className="h-3 w-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: tag.color || '#6b7280' }}
                    />
                    <span className="flex-1 text-left truncate">{tag.name}</span>
                    {isSelected && <Check className="h-4 w-4 text-[#6b21ef]" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Selected Tags Summary */}
        {selectedTags.size > 0 && (
          <div className="p-4 border-t border-white/[0.08] bg-white/[0.02]">
            <p className="text-xs text-[#c4bbd3] mb-2">Selected tags:</p>
            <div className="flex flex-wrap gap-1">
              {Array.from(selectedTags).map((tagId) => {
                const tag = availableTags?.find((t) => t.id === tagId);
                if (!tag) return null;
                return (
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
                      onClick={() => toggleTag(tag.id)}
                      className="hover:bg-white/10 rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-white/[0.08]">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => bulkTagMutation.mutate()}
            disabled={selectedTags.size === 0 || bulkTagMutation.isPending}
          >
            {bulkTagMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adding...
              </>
            ) : (
              <>
                <Tag className="mr-2 h-4 w-4" />
                Add {selectedTags.size > 0 ? `${selectedTags.size} Tag${selectedTags.size !== 1 ? 's' : ''}` : 'Tags'}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
