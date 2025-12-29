'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import {
  Folder,
  FolderOpen,
  FolderPlus,
  ChevronRight,
  ChevronDown,
  MoreVertical,
  Pencil,
  Trash2,
  Home,
  Loader2,
  X,
  Check,
} from 'lucide-react';

interface VirtualFolder {
  id: string;
  name: string;
  path: string;
  parentId: string | null;
  children?: VirtualFolder[];
  _count?: {
    files: number;
  };
}

interface FolderBrowserProps {
  bucketId: string;
  currentFolderId: string | null;
  onFolderSelect: (folderId: string | null) => void;
}

export function FolderBrowser({ bucketId, currentFolderId, onFolderSelect }: FolderBrowserProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolder, setEditingFolder] = useState<VirtualFolder | null>(null);
  const [deleteFolder, setDeleteFolder] = useState<VirtualFolder | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  // Fetch folders
  const { data: folders, isLoading } = useQuery({
    queryKey: ['folders', bucketId],
    queryFn: async () => {
      const { data } = await apiClient.get<VirtualFolder[]>(`/admin/buckets/${bucketId}/folders`);
      return data;
    },
  });

  // Fetch breadcrumb for current folder
  const { data: breadcrumb } = useQuery({
    queryKey: ['folder-breadcrumb', currentFolderId],
    queryFn: async () => {
      const { data } = await apiClient.get<VirtualFolder[]>(
        `/admin/folders/${currentFolderId}/breadcrumb`
      );
      return data;
    },
    enabled: !!currentFolderId,
  });

  const createMutation = useMutation({
    mutationFn: async ({ name, parentId }: { name: string; parentId: string | null }) => {
      await apiClient.post(`/admin/buckets/${bucketId}/folders`, { name, parentId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders', bucketId] });
      setShowCreateForm(false);
      setNewFolderName('');
      toast({ title: 'Folder created', variant: 'success' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to create folder', description: error.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      await apiClient.patch(`/admin/folders/${id}`, { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders', bucketId] });
      setEditingFolder(null);
      toast({ title: 'Folder renamed', variant: 'success' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to rename folder', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/admin/folders/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders', bucketId] });
      setDeleteFolder(null);
      if (currentFolderId === deleteFolder?.id) {
        onFolderSelect(null);
      }
      toast({ title: 'Folder deleted', variant: 'success' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to delete folder', description: error.message, variant: 'destructive' });
    },
  });

  const toggleExpand = (folderId: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId);
    } else {
      newExpanded.add(folderId);
    }
    setExpandedFolders(newExpanded);
  };

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;
    createMutation.mutate({ name: newFolderName.trim(), parentId: currentFolderId });
  };

  const handleRenameFolder = () => {
    if (!editingFolder || !editingFolder.name.trim()) return;
    updateMutation.mutate({ id: editingFolder.id, name: editingFolder.name.trim() });
  };

  const renderFolder = (folder: VirtualFolder, level: number = 0) => {
    const isExpanded = expandedFolders.has(folder.id);
    const isSelected = currentFolderId === folder.id;
    const hasChildren = folder.children && folder.children.length > 0;

    return (
      <div key={folder.id}>
        <div
          className={`flex items-center gap-1 py-1.5 px-2 rounded-lg cursor-pointer transition-colors group ${
            isSelected
              ? 'bg-[#ee4f27]/10 text-[#ee4f27]'
              : 'text-[#c4bbd3] hover:bg-white/[0.05] hover:text-white'
          }`}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
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
          {editingFolder?.id === folder.id ? (
            <div className="flex items-center gap-1 flex-1">
              <Input
                value={editingFolder.name}
                onChange={(e) => setEditingFolder({ ...editingFolder, name: e.target.value })}
                className="h-7 text-sm flex-1"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRenameFolder();
                  if (e.key === 'Escape') setEditingFolder(null);
                }}
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRenameFolder();
                }}
                className="p-1 hover:bg-white/10 rounded"
              >
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingFolder(null);
                }}
                className="p-1 hover:bg-white/10 rounded"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <>
              <div
                className="flex items-center gap-2 flex-1 min-w-0"
                onClick={() => onFolderSelect(folder.id)}
              >
                {isSelected || isExpanded ? (
                  <FolderOpen className="h-4 w-4 flex-shrink-0" />
                ) : (
                  <Folder className="h-4 w-4 flex-shrink-0" />
                )}
                <span className="text-sm truncate">{folder.name}</span>
                {folder._count && folder._count.files > 0 && (
                  <span className="text-xs opacity-60">({folder._count.files})</span>
                )}
              </div>

              {/* Actions Menu */}
              <div className="relative opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenMenu(openMenu === folder.id ? null : folder.id);
                  }}
                  className="p-1 hover:bg-white/10 rounded"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </button>

                {openMenu === folder.id && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setOpenMenu(null)}
                    />
                    <div className="absolute right-0 top-full mt-1 z-20 w-32 rounded-lg bg-[#1a1025] border border-white/[0.1] shadow-xl py-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingFolder(folder);
                          setOpenMenu(null);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-white hover:bg-white/[0.05]"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Rename
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteFolder(folder);
                          setOpenMenu(null);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
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
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-white/[0.08]">
        <span className="text-sm font-medium text-white">Folders</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          onClick={() => setShowCreateForm(true)}
        >
          <FolderPlus className="h-4 w-4" />
        </Button>
      </div>

      {/* Create Folder Form */}
      {showCreateForm && (
        <div className="p-3 border-b border-white/[0.08] bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <Input
              placeholder="Folder name..."
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              className="h-8 text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFolder();
                if (e.key === 'Escape') {
                  setShowCreateForm(false);
                  setNewFolderName('');
                }
              }}
              autoFocus
            />
            <Button
              size="sm"
              className="h-8 px-2"
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim() || createMutation.isPending}
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2"
              onClick={() => {
                setShowCreateForm(false);
                setNewFolderName('');
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          {currentFolderId && (
            <p className="text-xs text-[#c4bbd3] mt-2">
              Creating inside: {breadcrumb?.map((f) => f.name).join(' / ') || 'Loading...'}
            </p>
          )}
        </div>
      )}

      {/* Breadcrumb */}
      {currentFolderId && breadcrumb && (
        <div className="flex items-center gap-1 px-3 py-2 border-b border-white/[0.08] text-sm overflow-x-auto">
          <button
            onClick={() => onFolderSelect(null)}
            className="text-[#c4bbd3] hover:text-white transition-colors flex items-center gap-1 flex-shrink-0"
          >
            <Home className="h-3.5 w-3.5" />
          </button>
          {breadcrumb.map((folder, index) => (
            <div key={folder.id} className="flex items-center gap-1 flex-shrink-0">
              <ChevronRight className="h-3 w-3 text-[#c4bbd3]/60" />
              <button
                onClick={() => onFolderSelect(folder.id)}
                className={`hover:text-white transition-colors truncate max-w-[100px] ${
                  index === breadcrumb.length - 1 ? 'text-white' : 'text-[#c4bbd3]'
                }`}
              >
                {folder.name}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Folders Tree */}
      <div className="flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 text-[#ee4f27] animate-spin" />
          </div>
        ) : !folders || folders.length === 0 ? (
          <div className="py-8 text-center">
            <Folder className="h-8 w-8 text-[#c4bbd3]/30 mx-auto mb-2" />
            <p className="text-sm text-[#c4bbd3]">No folders</p>
            <p className="text-xs text-[#c4bbd3]/60 mt-1">
              Create folders to organize files
            </p>
          </div>
        ) : (
          <div>
            {/* Root option */}
            <div
              className={`flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-pointer transition-colors ${
                currentFolderId === null
                  ? 'bg-[#ee4f27]/10 text-[#ee4f27]'
                  : 'text-[#c4bbd3] hover:bg-white/[0.05] hover:text-white'
              }`}
              onClick={() => onFolderSelect(null)}
            >
              <Home className="h-4 w-4" />
              <span className="text-sm">All Files</span>
            </div>

            {/* Folder tree */}
            {folders.map((folder) => renderFolder(folder))}
          </div>
        )}
      </div>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deleteFolder}
        onOpenChange={(open) => !open && setDeleteFolder(null)}
        title={`Delete folder "${deleteFolder?.name}"?`}
        description="This will delete the folder and all files inside it. This action cannot be undone."
        variant="destructive"
        confirmLabel="Delete"
        onConfirm={() => deleteFolder && deleteMutation.mutate(deleteFolder.id)}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
