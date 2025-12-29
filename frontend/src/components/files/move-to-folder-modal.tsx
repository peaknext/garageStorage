'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import {
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Home,
  Loader2,
  X,
  Check,
  FolderInput,
} from 'lucide-react';

interface VirtualFolder {
  id: string;
  name: string;
  path: string;
  parentId: string | null;
  children?: VirtualFolder[];
}

interface MoveToFolderModalProps {
  bucketId: string;
  fileIds: string[];
  onClose: () => void;
  onSuccess?: () => void;
}

export function MoveToFolderModal({ bucketId, fileIds, onClose, onSuccess }: MoveToFolderModalProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  // Fetch folders
  const { data: folders, isLoading } = useQuery({
    queryKey: ['folders', bucketId],
    queryFn: async () => {
      const { data } = await apiClient.get<VirtualFolder[]>(`/admin/buckets/${bucketId}/folders`);
      return data;
    },
  });

  const moveMutation = useMutation({
    mutationFn: async ({ fileId, folderId }: { fileId: string; folderId: string }) => {
      await apiClient.post(`/admin/buckets/${bucketId}/files/${fileId}/folders`, {
        folderId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bucket-files', bucketId] });
      queryClient.invalidateQueries({ queryKey: ['folders', bucketId] });
    },
  });

  const handleMove = async () => {
    if (!selectedFolderId) return;

    try {
      for (const fileId of fileIds) {
        await moveMutation.mutateAsync({ fileId, folderId: selectedFolderId });
      }
      toast({
        title: 'Files moved',
        description: `Moved ${fileIds.length} file${fileIds.length !== 1 ? 's' : ''} to folder`,
        variant: 'success',
      });
      onSuccess?.();
      onClose();
    } catch (error) {
      toast({
        title: 'Failed to move files',
        description: (error as Error).message,
        variant: 'destructive',
      });
    }
  };

  const toggleExpand = (folderId: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId);
    } else {
      newExpanded.add(folderId);
    }
    setExpandedFolders(newExpanded);
  };

  const renderFolder = (folder: VirtualFolder, level: number = 0) => {
    const isExpanded = expandedFolders.has(folder.id);
    const isSelected = selectedFolderId === folder.id;
    const hasChildren = folder.children && folder.children.length > 0;

    return (
      <div key={folder.id}>
        <div
          className={`flex items-center gap-1 py-2 px-3 rounded-lg cursor-pointer transition-colors ${
            isSelected
              ? 'bg-[#ee4f27]/10 text-[#ee4f27] border border-[#ee4f27]/30'
              : 'text-[#c4bbd3] hover:bg-white/[0.05] hover:text-white border border-transparent'
          }`}
          style={{ marginLeft: `${level * 20}px` }}
          onClick={() => setSelectedFolderId(folder.id)}
        >
          {/* Expand/Collapse */}
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(folder.id);
              }}
              className="p-0.5 hover:bg-white/10 rounded"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
          ) : (
            <div className="w-5" />
          )}

          {/* Folder Icon and Name */}
          {isSelected || isExpanded ? (
            <FolderOpen className="h-4 w-4 flex-shrink-0" />
          ) : (
            <Folder className="h-4 w-4 flex-shrink-0" />
          )}
          <span className="text-sm truncate">{folder.name}</span>

          {isSelected && (
            <Check className="h-4 w-4 ml-auto text-[#ee4f27]" />
          )}
        </div>

        {/* Children */}
        {isExpanded && hasChildren && (
          <div>
            {folder.children!.map((child) => renderFolder(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-[#1a1025] border border-white/[0.1] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#6b21ef]/20 to-[#6b21ef]/5 border border-white/[0.08]">
              <FolderInput className="h-5 w-5 text-[#6b21ef]" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Move to Folder</h3>
              <p className="text-sm text-[#c4bbd3]">
                {fileIds.length} file{fileIds.length !== 1 ? 's' : ''} selected
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="max-h-[400px] overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 text-[#ee4f27] animate-spin" />
            </div>
          ) : !folders || folders.length === 0 ? (
            <div className="py-12 text-center">
              <Folder className="h-12 w-12 text-[#c4bbd3]/30 mx-auto mb-3" />
              <p className="text-[#c4bbd3]">No folders available</p>
              <p className="text-sm text-[#c4bbd3]/60 mt-1">
                Create folders first to organize your files
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {folders.map((folder) => renderFolder(folder))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/[0.08] bg-white/[0.02]">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleMove}
            disabled={!selectedFolderId || moveMutation.isPending}
          >
            {moveMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Moving...
              </>
            ) : (
              <>
                <FolderInput className="mr-2 h-4 w-4" />
                Move Here
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
