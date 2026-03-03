"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { apiClient } from "@/lib/api-client";
import { formatBytes, formatDate } from "@/lib/utils";
import {
  ArrowLeft,
  FolderOpen,
  File,
  Trash2,
  Globe,
  Lock,
  Download,
  Upload,
  Clock,
  Database,
  RefreshCw,
  Copy,
  Check,
  Image,
  RotateCcw,
  AlertTriangle,
  Loader2,
  Building2,
  ChevronDown,
} from "lucide-react";
import { useState, useEffect } from "react";
import { FileList, FileFilters } from "@/components/files/file-list";
import { UploadModal } from "@/components/files/upload-modal";
import { ShareModal } from "@/components/files/share-modal";
import { FolderBrowser } from "@/components/files/folder-browser";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

interface Bucket {
  id: string;
  name: string;
  garageBucketId: string;
  applicationId: string;
  usedBytes: number;
  quotaBytes: number | null;
  fileCount: number;
  isPublic: boolean;
  corsEnabled: boolean;
  versioningEnabled: boolean;
  application: {
    name: string;
    slug: string;
  };
  createdAt: string;
  updatedAt: string;
}

interface FileItem {
  id: string;
  key: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  isPublic: boolean;
  downloadCount: number;
  createdAt: string;
  url: string;
}

interface DeletedFile {
  id: string;
  key: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  deletedAt: string;
  deletedBy: string;
  daysRemaining: number;
  createdAt: string;
}

interface RecycleBinStats {
  totalFiles: number;
  totalBytes: number;
  oldestFile: {
    name: string;
    deletedAt: string;
    daysRemaining: number;
  } | null;
}

interface Application {
  id: string;
  name: string;
  slug: string;
}

const defaultFilters: FileFilters = {
  search: "",
  mimeType: "",
  dateFrom: "",
  dateTo: "",
  sizeMin: "",
  sizeMax: "",
};

export default function BucketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [shareFile, setShareFile] = useState<FileItem | null>(null);
  const [copied, setCopied] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [filters, setFilters] = useState<FileFilters>(defaultFilters);
  const [debouncedFilters, setDebouncedFilters] =
    useState<FileFilters>(defaultFilters);
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"files" | "recycle-bin" | "settings">("files");
  const [selectedDeletedFiles, setSelectedDeletedFiles] = useState<Set<string>>(
    new Set()
  );
  const [showEmptyBinDialog, setShowEmptyBinDialog] = useState(false);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [selectedAppId, setSelectedAppId] = useState("");
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 20;

  // Debounce filter changes and reset page
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedFilters(filters);
      setPage(1); // Reset to first page when filters change
    }, 300);
    return () => clearTimeout(timer);
  }, [filters]);

  // Reset page when folder changes
  useEffect(() => {
    setPage(1);
  }, [currentFolderId]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hasActiveFilters =
    debouncedFilters.search ||
    debouncedFilters.mimeType ||
    debouncedFilters.dateFrom ||
    debouncedFilters.dateTo ||
    debouncedFilters.sizeMin ||
    debouncedFilters.sizeMax;

  const { data: bucket, isLoading } = useQuery({
    queryKey: ["bucket", params.id],
    queryFn: async () => {
      const { data } = await apiClient.get<Bucket>(
        `/admin/buckets/${params.id}`
      );
      return data;
    },
  });

  // Fetch all applications for reassignment dropdown
  const { data: applications } = useQuery({
    queryKey: ["applications"],
    queryFn: async () => {
      const response = await apiClient.get<{ data: Application[] }>(
        "/admin/applications",
        { params: { limit: 100 } }
      );
      return response.data?.data || [];
    },
  });

  // Mutation for bucket reassignment
  const reassignMutation = useMutation({
    mutationFn: async (applicationId: string) => {
      const { data } = await apiClient.patch(`/admin/buckets/${params.id}`, {
        applicationId,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bucket", params.id] });
      queryClient.invalidateQueries({ queryKey: ["buckets"] });
      setShowReassignModal(false);
      setSelectedAppId("");
      toast({
        title: "Bucket reassigned",
        description: "The bucket has been moved to the new application",
        variant: "success",
      });
    },
    onError: (error: { response?: { data?: { message?: string } } }) => {
      toast({
        title: "Reassignment failed",
        description:
          error.response?.data?.message || "Failed to reassign bucket",
        variant: "destructive",
      });
    },
  });

  // Fetch files with server-side filtering and pagination (when no folder selected)
  const {
    data: allFilesData,
    isLoading: allFilesLoading,
    refetch: refetchFiles,
  } = useQuery({
    queryKey: ["bucket-files", params.id, debouncedFilters, page],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      searchParams.append("page", page.toString());
      searchParams.append("limit", ITEMS_PER_PAGE.toString());
      if (debouncedFilters.search)
        searchParams.append("search", debouncedFilters.search);
      if (debouncedFilters.mimeType)
        searchParams.append("mimeType", debouncedFilters.mimeType);
      if (debouncedFilters.dateFrom)
        searchParams.append("dateFrom", debouncedFilters.dateFrom);
      if (debouncedFilters.dateTo)
        searchParams.append("dateTo", debouncedFilters.dateTo);
      if (debouncedFilters.sizeMin)
        searchParams.append("sizeMin", debouncedFilters.sizeMin);
      if (debouncedFilters.sizeMax)
        searchParams.append("sizeMax", debouncedFilters.sizeMax);

      const url = `/admin/buckets/${
        params.id
      }/files?${searchParams.toString()}`;

      const { data } = await apiClient.get<{
        data: FileItem[];
        meta: { total: number; totalPages: number };
      }>(url);
      return data;
    },
    enabled: !!bucket && !currentFolderId,
  });

  // Fetch files in selected folder (no filtering for folder view)
  const { data: folderFilesData, isLoading: folderFilesLoading } = useQuery({
    queryKey: ["folder-files", currentFolderId],
    queryFn: async () => {
      const { data } = await apiClient.get<{
        data: FileItem[];
        meta: { total: number };
      }>(`/admin/folders/${currentFolderId}/files`);
      return data;
    },
    enabled: !!bucket && !!currentFolderId,
  });

  const files = currentFolderId ? folderFilesData?.data : allFilesData?.data;
  const filesLoading = currentFolderId ? folderFilesLoading : allFilesLoading;
  const totalFiles = currentFolderId
    ? folderFilesData?.meta?.total
    : allFilesData?.meta?.total;

  // Recycle bin queries
  const { data: recycleBinStats, isLoading: recycleBinStatsLoading } = useQuery(
    {
      queryKey: ["bucket-recycle-bin-stats", params.id],
      queryFn: async () => {
        const { data } = await apiClient.get<RecycleBinStats>(
          `/admin/buckets/${params.id}/recycle-bin/stats`
        );
        return data;
      },
      enabled: activeTab === "recycle-bin",
    }
  );

  const {
    data: deletedFilesData,
    isLoading: deletedFilesLoading,
    refetch: refetchDeletedFiles,
  } = useQuery({
    queryKey: ["bucket-recycle-bin-files", params.id],
    queryFn: async () => {
      const { data } = await apiClient.get<{
        data: DeletedFile[];
        meta: { total: number };
      }>(`/admin/buckets/${params.id}/recycle-bin?limit=100`);
      return data;
    },
    enabled: activeTab === "recycle-bin",
  });

  const deletedFiles = deletedFilesData?.data || [];

  // Restore mutation
  const restoreMutation = useMutation({
    mutationFn: async (fileId: string) => {
      await apiClient.post(`/admin/recycle-bin/${fileId}/restore`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["bucket-recycle-bin-files", params.id],
      });
      queryClient.invalidateQueries({
        queryKey: ["bucket-recycle-bin-stats", params.id],
      });
      queryClient.invalidateQueries({ queryKey: ["bucket", params.id] });
      queryClient.invalidateQueries({ queryKey: ["bucket-files", params.id] });
      setSelectedDeletedFiles(new Set());
      toast({ title: "File restored successfully", variant: "success" });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to restore file",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Permanent delete mutation
  const permanentDeleteMutation = useMutation({
    mutationFn: async (fileId: string) => {
      await apiClient.delete(`/admin/recycle-bin/${fileId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["bucket-recycle-bin-files", params.id],
      });
      queryClient.invalidateQueries({
        queryKey: ["bucket-recycle-bin-stats", params.id],
      });
      setSelectedDeletedFiles(new Set());
      toast({ title: "File permanently deleted", variant: "success" });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete file",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Empty bucket recycle bin mutation
  const emptyBucketBinMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post(`/admin/buckets/${params.id}/recycle-bin/purge`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["bucket-recycle-bin-files", params.id],
      });
      queryClient.invalidateQueries({
        queryKey: ["bucket-recycle-bin-stats", params.id],
      });
      setSelectedDeletedFiles(new Set());
      setShowEmptyBinDialog(false);
      toast({ title: "Recycle bin emptied", variant: "success" });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to empty recycle bin",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Toggle deleted file selection
  const toggleDeletedFileSelection = (fileId: string) => {
    const newSelected = new Set(selectedDeletedFiles);
    if (newSelected.has(fileId)) {
      newSelected.delete(fileId);
    } else {
      newSelected.add(fileId);
    }
    setSelectedDeletedFiles(newSelected);
  };

  // Handle bulk restore
  const handleBulkRestore = async () => {
    for (const fileId of Array.from(selectedDeletedFiles)) {
      await restoreMutation.mutateAsync(fileId);
    }
  };

  // Handle bulk permanent delete
  const handleBulkPermanentDelete = async () => {
    for (const fileId of Array.from(selectedDeletedFiles)) {
      await permanentDeleteMutation.mutateAsync(fileId);
    }
  };

  const isBinMutating =
    restoreMutation.isPending ||
    permanentDeleteMutation.isPending ||
    emptyBucketBinMutation.isPending;

  const syncFilesMutation = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post<{
        synced: number;
        skipped: number;
        totalInS3: number;
        newUsedBytes: number;
      }>(`/admin/buckets/${params.id}/files/sync`);
      return data;
    },
    onSuccess: async (data) => {
      await refetchFiles();
      queryClient.invalidateQueries({ queryKey: ["bucket", params.id] });
      if (data.synced > 0) {
        toast({
          title: "Files Synced",
          description: `Synced ${data.synced} file(s) from Garage S3`,
          variant: "success",
        });
      } else {
        toast({
          title: "Already in Sync",
          description: `No new files to sync (${data.totalInS3} files already in sync)`,
          variant: "default",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Sync Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const regenerateThumbnailsMutation = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post<{
        queued: number;
        skipped: number;
      }>(`/admin/buckets/${params.id}/processing/thumbnails/regenerate`);
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: "Thumbnails Regenerating",
        description: `Queued ${data.queued} image(s) for thumbnail generation`,
        variant: "success",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Regeneration Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiClient.delete(`/admin/buckets/${params.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["buckets"] });
      router.push("/buckets");
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="relative">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#ee4f27]/30 border-t-[#ee4f27]" />
          <div className="absolute inset-0 h-10 w-10 animate-pulse rounded-full bg-[#ee4f27]/10" />
        </div>
      </div>
    );
  }

  if (!bucket) {
    return (
      <div className="text-center py-12">
        <FolderOpen className="h-16 w-16 text-[#c4bbd3]/30 mx-auto mb-4" />
        <p className="text-lg font-medium text-white mb-2">Bucket not found</p>
        <Link href="/buckets">
          <Button variant="outline">Back to Buckets</Button>
        </Link>
      </div>
    );
  }

  const storagePercentage = bucket.quotaBytes
    ? (bucket.usedBytes / bucket.quotaBytes) * 100
    : 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/buckets">
            <Button variant="ghost" size="icon" className="h-10 w-10">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-[#6b21ef]/20 to-[#6b21ef]/5 border border-white/[0.08]">
              <FolderOpen className="h-7 w-7 text-[#6b21ef]" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white tracking-tight">
                {bucket.name}
              </h1>
              <p className="text-[#c4bbd3]">
                {bucket.application?.name || "Unknown App"}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {bucket.isPublic ? (
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <Globe className="h-4 w-4 text-emerald-400" />
              <span className="text-sm font-medium text-emerald-400">
                Public
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.05] border border-white/[0.1]">
              <Lock className="h-4 w-4 text-[#c4bbd3]" />
              <span className="text-sm font-medium text-[#c4bbd3]">
                Private
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-6 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-[#6b21ef]" />
              <CardDescription>Storage Used</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {formatBytes(bucket.usedBytes)}
            </div>
            {bucket.quotaBytes && (
              <>
                <p className="text-sm text-[#c4bbd3]/70 mt-1">
                  of {formatBytes(bucket.quotaBytes)}
                </p>
                <Progress value={storagePercentage} className="mt-3 h-2" />
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <File className="h-4 w-4 text-[#ee4f27]" />
              <CardDescription>Files</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {bucket.fileCount}
            </div>
            <p className="text-sm text-[#c4bbd3]/70 mt-1">total files</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-emerald-400" />
              <CardDescription>Created</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {formatDate(bucket.createdAt)}
            </div>
            <p className="text-sm text-[#c4bbd3]/70 mt-1">bucket created</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Upload className="h-4 w-4 text-sky-400" />
              <CardDescription>Last Updated</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {formatDate(bucket.updatedAt)}
            </div>
            <p className="text-sm text-[#c4bbd3]/70 mt-1">last modified</p>
          </CardContent>
        </Card>
      </div>

      {/* Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#6b21ef]/20 to-[#6b21ef]/5 border border-white/[0.08]">
              <FolderOpen className="h-5 w-5 text-[#6b21ef]" />
            </div>
            <div>
              <CardTitle>Bucket Settings</CardTitle>
              <CardDescription>Configuration for this bucket</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Application */}
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.08]">
              <p className="text-sm font-medium text-[#c4bbd3] mb-2">
                Application
              </p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-[#6b21ef]" />
                  <span className="text-white font-medium">
                    {bucket.application?.name || "Unknown"}
                  </span>
                  <span className="text-[#c4bbd3] text-sm">
                    ({bucket.application?.slug || "N/A"})
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedAppId(bucket.applicationId);
                    setShowReassignModal(true);
                  }}
                >
                  Change Application
                </Button>
              </div>
            </div>

            {/* Garage Bucket ID */}
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.08]">
              <p className="text-sm font-medium text-[#c4bbd3] mb-2">
                Garage Bucket ID
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm font-mono text-white bg-black/20 px-3 py-2 rounded-lg overflow-x-auto">
                  {bucket.garageBucketId}
                </code>
                <button
                  onClick={() => copyToClipboard(bucket.garageBucketId)}
                  className="p-2 rounded-lg hover:bg-white/[0.05] transition-colors"
                  title="Copy to clipboard"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <Copy className="h-4 w-4 text-[#c4bbd3]" />
                  )}
                </button>
              </div>
            </div>

            {/* Settings Grid */}
            <div className="grid gap-4 md:grid-cols-3">
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.08]">
                <p className="text-sm font-medium text-[#c4bbd3] mb-2">
                  Access
                </p>
                <div className="flex items-center gap-2">
                  {bucket.isPublic ? (
                    <>
                      <Globe className="h-5 w-5 text-emerald-400" />
                      <span className="text-white font-medium">Public</span>
                    </>
                  ) : (
                    <>
                      <Lock className="h-5 w-5 text-[#c4bbd3]" />
                      <span className="text-white font-medium">Private</span>
                    </>
                  )}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.08]">
                <p className="text-sm font-medium text-[#c4bbd3] mb-2">CORS</p>
                <span
                  className={`text-white font-medium ${
                    bucket.corsEnabled ? "text-emerald-400" : "text-[#c4bbd3]"
                  }`}
                >
                  {bucket.corsEnabled ? "Enabled" : "Disabled"}
                </span>
              </div>
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.08]">
                <p className="text-sm font-medium text-[#c4bbd3] mb-2">
                  Versioning
                </p>
                <span
                  className={`text-white font-medium ${
                    bucket.versioningEnabled
                      ? "text-emerald-400"
                      : "text-[#c4bbd3]"
                  }`}
                >
                  {bucket.versioningEnabled ? "Enabled" : "Disabled"}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Files Management with Tabs */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br border border-white/[0.08] ${
                  activeTab === "files"
                    ? "from-[#ee4f27]/20 to-[#ee4f27]/5"
                    : "from-red-500/20 to-red-500/5"
                }`}
              >
                {activeTab === "files" ? (
                  <File className="h-5 w-5 text-[#ee4f27]" />
                ) : (
                  <Trash2 className="h-5 w-5 text-red-400" />
                )}
              </div>
              <div>
                <CardTitle>
                  {activeTab === "files" ? "Files" : "Recycle Bin"}
                </CardTitle>
                <CardDescription>
                  {activeTab === "files"
                    ? `${totalFiles || 0} files in this bucket`
                    : `${deletedFiles.length} deleted files`}
                </CardDescription>
              </div>
            </div>
            {/* Tab Switcher */}
            <div className="flex items-center gap-4">
              <div className="flex bg-white/[0.05] rounded-lg p-1">
                <button
                  onClick={() => setActiveTab("files")}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                    activeTab === "files"
                      ? "bg-[#6b21ef] text-white"
                      : "text-[#c4bbd3] hover:text-white"
                  }`}
                >
                  <File className="h-4 w-4 inline mr-2" />
                  Files
                </button>
                <button
                  onClick={() => setActiveTab("recycle-bin")}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                    activeTab === "recycle-bin"
                      ? "bg-red-500/80 text-white"
                      : "text-[#c4bbd3] hover:text-white"
                  }`}
                >
                  <Trash2 className="h-4 w-4 inline mr-2" />
                  Recycle Bin
                  {recycleBinStats?.totalFiles ? (
                    <span className="ml-2 px-2 py-0.5 text-xs bg-red-500/30 rounded-full">
                      {recycleBinStats.totalFiles}
                    </span>
                  ) : null}
                </button>
                <button
                  onClick={() => setActiveTab("settings")}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                    activeTab === "settings"
                      ? "bg-[#6b21ef] text-white"
                      : "text-[#c4bbd3] hover:text-white"
                  }`}
                >
                  <Globe className="h-4 w-4 inline mr-2" />
                  Settings
                </button>
              </div>
              {activeTab === "files" && (
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => regenerateThumbnailsMutation.mutate()}
                    disabled={regenerateThumbnailsMutation.isPending}
                  >
                    {regenerateThumbnailsMutation.isPending ? (
                      <>
                        <Image className="mr-2 h-4 w-4 animate-pulse" />
                        Regenerating...
                      </>
                    ) : (
                      <>
                        <Image className="mr-2 h-4 w-4" />
                        Regenerate Thumbnails
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => syncFilesMutation.mutate()}
                    disabled={syncFilesMutation.isPending}
                  >
                    {syncFilesMutation.isPending ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        Syncing...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Sync Files
                      </>
                    )}
                  </Button>
                  <Button onClick={() => setShowUploadModal(true)}>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload Files
                  </Button>
                </div>
              )}
              {activeTab === "recycle-bin" && deletedFiles.length > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowEmptyBinDialog(true)}
                  disabled={isBinMutating}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Empty Recycle Bin
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {activeTab === "files" && (
            <div className="flex">
              {/* Folder Browser Sidebar */}
              <div className="w-64 border-r border-white/[0.08] flex-shrink-0">
                <FolderBrowser
                  bucketId={params.id as string}
                  currentFolderId={currentFolderId}
                  onFolderSelect={setCurrentFolderId}
                />
              </div>
              {/* File List */}
              <div className="flex-1 p-6">
                <FileList
                  files={files || []}
                  bucketId={params.id as string}
                  applicationId={bucket.applicationId}
                  isLoading={filesLoading}
                  onShare={(file) => setShareFile(file)}
                  filters={filters}
                  onFiltersChange={setFilters}
                  totalFiles={totalFiles || 0}
                  isInFolder={!!currentFolderId}
                  page={page}
                  limit={ITEMS_PER_PAGE}
                  totalPages={allFilesData?.meta?.totalPages || 1}
                  onPageChange={currentFolderId ? undefined : setPage}
                />
              </div>
            </div>
          )}
          {activeTab === "recycle-bin" && (
            <div className="p-6">
              {/* Recycle Bin Stats */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.08]">
                  <p className="text-sm text-[#c4bbd3]">Deleted Files</p>
                  <p className="text-xl font-bold text-white">
                    {recycleBinStatsLoading
                      ? "..."
                      : recycleBinStats?.totalFiles || 0}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.08]">
                  <p className="text-sm text-[#c4bbd3]">Space Used</p>
                  <p className="text-xl font-bold text-white">
                    {recycleBinStatsLoading
                      ? "..."
                      : formatBytes(recycleBinStats?.totalBytes || 0)}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.08]">
                  <p className="text-sm text-[#c4bbd3]">Oldest File</p>
                  {recycleBinStats?.oldestFile ? (
                    <div>
                      <p className="text-sm font-medium text-white truncate">
                        {recycleBinStats.oldestFile.name}
                      </p>
                      <p className="text-xs text-yellow-400">
                        {recycleBinStats.oldestFile.daysRemaining} days
                        remaining
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No deleted files</p>
                  )}
                </div>
              </div>

              {/* Bulk Actions */}
              {selectedDeletedFiles.size > 0 && (
                <div className="flex items-center gap-4 p-3 mb-4 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                  <span className="text-sm text-white">
                    {selectedDeletedFiles.size} file
                    {selectedDeletedFiles.size > 1 ? "s" : ""} selected
                  </span>
                  <div className="flex-1" />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleBulkRestore}
                    disabled={isBinMutating}
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Restore Selected
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleBulkPermanentDelete}
                    disabled={isBinMutating}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Permanently
                  </Button>
                </div>
              )}

              {/* Deleted Files Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="px-4 py-3 text-left">
                        <input
                          type="checkbox"
                          checked={
                            selectedDeletedFiles.size === deletedFiles.length &&
                            deletedFiles.length > 0
                          }
                          onChange={() => {
                            if (
                              selectedDeletedFiles.size === deletedFiles.length
                            ) {
                              setSelectedDeletedFiles(new Set());
                            } else {
                              setSelectedDeletedFiles(
                                new Set(deletedFiles.map((f) => f.id))
                              );
                            }
                          }}
                          className="rounded border-white/20 bg-white/5"
                        />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-[#c4bbd3] uppercase">
                        Name
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-[#c4bbd3] uppercase">
                        Size
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-[#c4bbd3] uppercase">
                        Deleted
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-[#c4bbd3] uppercase">
                        Days Left
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-[#c4bbd3] uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {deletedFilesLoading ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-4 py-8 text-center text-[#c4bbd3]"
                        >
                          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                          Loading deleted files...
                        </td>
                      </tr>
                    ) : deletedFiles.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-4 py-8 text-center text-[#c4bbd3]"
                        >
                          <Trash2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                          Recycle bin is empty
                        </td>
                      </tr>
                    ) : (
                      deletedFiles.map((file) => (
                        <tr
                          key={file.id}
                          className="border-b border-white/5 hover:bg-white/5"
                        >
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={selectedDeletedFiles.has(file.id)}
                              onChange={() =>
                                toggleDeletedFileSelection(file.id)
                              }
                              className="rounded border-white/20 bg-white/5"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <File className="w-4 h-4 text-[#c4bbd3]" />
                              <span className="text-white text-sm truncate max-w-[200px]">
                                {file.originalName}
                              </span>
                            </div>
                            <p className="text-xs text-[#c4bbd3]/60 truncate max-w-[200px]">
                              {file.key}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-sm text-[#c4bbd3]">
                            {formatBytes(file.sizeBytes)}
                          </td>
                          <td className="px-4 py-3 text-sm text-[#c4bbd3]">
                            {formatDistanceToNow(new Date(file.deletedAt), {
                              addSuffix: true,
                            })}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`text-sm font-medium ${
                                file.daysRemaining <= 7
                                  ? "text-red-400"
                                  : file.daysRemaining <= 14
                                  ? "text-yellow-400"
                                  : "text-green-400"
                              }`}
                            >
                              {file.daysRemaining} days
                              {file.daysRemaining <= 7 && (
                                <AlertTriangle className="w-3 h-3 inline ml-1" />
                              )}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => restoreMutation.mutate(file.id)}
                                disabled={isBinMutating}
                                title="Restore"
                              >
                                <RotateCcw className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  permanentDeleteMutation.mutate(file.id)
                                }
                                disabled={isBinMutating}
                                className="text-red-400 hover:text-red-300"
                                title="Delete permanently"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {activeTab === "settings" && (
            <BucketSettingsTab bucket={bucket} />
          )}
        </CardContent>
      </Card>

      {/* Empty Recycle Bin Dialog */}
      {showEmptyBinDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => setShowEmptyBinDialog(false)}
          />
          <div className="relative bg-[#1a1025] border border-white/10 rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              Empty Recycle Bin?
            </h2>
            <p className="text-[#c4bbd3] mb-4">
              This will permanently delete{" "}
              <span className="text-white font-medium">
                {recycleBinStats?.totalFiles || 0} files
              </span>{" "}
              ({formatBytes(recycleBinStats?.totalBytes || 0)}). This action
              cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setShowEmptyBinDialog(false)}
                disabled={emptyBucketBinMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => emptyBucketBinMutation.mutate()}
                disabled={emptyBucketBinMutation.isPending}
              >
                {emptyBucketBinMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Empty Recycle Bin
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <UploadModal
            bucketId={params.id as string}
            onClose={() => setShowUploadModal(false)}
            onSuccess={() => {
              queryClient.invalidateQueries({
                queryKey: ["bucket", params.id],
              });
            }}
          />
        </div>
      )}

      {/* Share Modal */}
      {shareFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <ShareModal
            fileId={shareFile.id}
            fileName={shareFile.originalName}
            onClose={() => setShareFile(null)}
          />
        </div>
      )}

      {/* Reassign Application Modal */}
      {showReassignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => {
              setShowReassignModal(false);
              setSelectedAppId("");
            }}
          />
          <div className="relative bg-[#1a1025] border border-white/10 rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-[#6b21ef]" />
              Change Application
            </h2>
            <p className="text-[#c4bbd3] mb-4">
              Move bucket <span className="text-white font-medium">{bucket.name}</span> to a different application.
              This will also transfer the storage quota usage.
            </p>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-white">Target Application</label>
                <div className="relative">
                  <select
                    value={selectedAppId}
                    onChange={(e) => setSelectedAppId(e.target.value)}
                    className="w-full h-11 px-4 pr-10 rounded-xl border border-white/[0.1] bg-white/[0.03] text-white focus:outline-none focus:ring-2 focus:ring-[#6b21ef]/50 focus:border-[#6b21ef]/50 hover:border-white/[0.2] transition-colors appearance-none cursor-pointer"
                  >
                    {applications?.map((app) => (
                      <option
                        key={app.id}
                        value={app.id}
                        className="bg-[#0e0918] text-white"
                        disabled={app.id === bucket.applicationId}
                      >
                        {app.name} ({app.slug}){app.id === bucket.applicationId ? " - Current" : ""}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#c4bbd3] pointer-events-none" />
                </div>
              </div>

              {selectedAppId && selectedAppId !== bucket.applicationId && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <p className="text-sm text-amber-300">
                    <AlertTriangle className="w-4 h-4 inline mr-2" />
                    This bucket will be moved to{" "}
                    <span className="font-medium">
                      {applications?.find((a) => a.id === selectedAppId)?.name}
                    </span>
                    . Storage quota will be adjusted for both applications.
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <Button
                variant="outline"
                onClick={() => {
                  setShowReassignModal(false);
                  setSelectedAppId("");
                }}
                disabled={reassignMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={() => reassignMutation.mutate(selectedAppId)}
                disabled={
                  reassignMutation.isPending ||
                  !selectedAppId ||
                  selectedAppId === bucket.applicationId
                }
              >
                {reassignMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Moving...
                  </>
                ) : (
                  "Move Bucket"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Danger Zone */}
      <Card className="border-red-500/20">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-red-500/20 to-red-500/5 border border-red-500/20">
              <Trash2 className="h-5 w-5 text-red-400" />
            </div>
            <div>
              <CardTitle className="text-red-400">Danger Zone</CardTitle>
              <CardDescription>Irreversible actions</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 rounded-xl bg-red-500/5 border border-red-500/20">
            <div>
              <p className="text-white font-medium">Delete Bucket</p>
              <p className="text-sm text-[#c4bbd3]">
                This will delete all files in the bucket
              </p>
            </div>
            {deleteConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-[#c4bbd3]">Are you sure?</span>
                <Button
                  size="sm"
                  className="bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/20"
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? "Deleting..." : "Yes, Delete"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDeleteConfirm(false)}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                onClick={() => setDeleteConfirm(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function BucketSettingsTab({ bucket }: { bucket: Bucket }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [corsOrigins, setCorsOrigins] = useState(
    (bucket as any).allowedOrigins?.join("\n") || ""
  );
  const [corsEnabled, setCorsEnabled] = useState(bucket.corsEnabled || false);
  const [lifecycleRules, setLifecycleRules] = useState(
    JSON.stringify((bucket as any).lifecycleRules || [], null, 2)
  );

  const updateMutation = useMutation({
    mutationFn: (data: any) =>
      apiClient.patch(`/admin/buckets/${bucket.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bucket", bucket.id] });
      toast({
        title: "Settings saved",
        description: "Bucket settings have been updated.",
        variant: "success",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const handleSaveCors = () => {
    const origins = corsOrigins
      .split("\n")
      .map((o: string) => o.trim())
      .filter(Boolean);
    updateMutation.mutate({ corsEnabled, allowedOrigins: origins });
  };

  const handleSaveLifecycle = () => {
    try {
      const rules = JSON.parse(lifecycleRules);
      updateMutation.mutate({ lifecycleRules: rules });
    } catch {
      toast({
        title: "Invalid JSON",
        description: "Lifecycle rules must be valid JSON.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* CORS Settings */}
      <div className="p-6 rounded-xl bg-white/[0.02] border border-white/[0.08]">
        <div className="flex items-center gap-3 mb-4">
          <Globe className="h-5 w-5 text-[#6b21ef]" />
          <h3 className="text-lg font-semibold text-white">CORS Settings</h3>
        </div>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="corsEnabled"
              checked={corsEnabled}
              onChange={(e) => setCorsEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-white/[0.05] text-[#6b21ef] focus:ring-[#6b21ef]"
            />
            <label htmlFor="corsEnabled" className="text-sm text-white">
              Enable CORS for this bucket
            </label>
          </div>
          {corsEnabled && (
            <div>
              <label className="text-sm text-[#c4bbd3] mb-2 block">
                Allowed Origins (one per line)
              </label>
              <textarea
                value={corsOrigins}
                onChange={(e) => setCorsOrigins(e.target.value)}
                placeholder={"https://example.com\nhttps://app.example.com"}
                rows={4}
                className="w-full px-4 py-3 rounded-xl border border-white/[0.1] bg-white/[0.03] text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#6b21ef]/50 font-mono text-sm"
              />
            </div>
          )}
          <Button
            onClick={handleSaveCors}
            disabled={updateMutation.isPending}
            size="sm"
          >
            Save CORS Settings
          </Button>
        </div>
      </div>

      {/* Lifecycle Rules */}
      <div className="p-6 rounded-xl bg-white/[0.02] border border-white/[0.08]">
        <div className="flex items-center gap-3 mb-4">
          <Clock className="h-5 w-5 text-[#ee4f27]" />
          <h3 className="text-lg font-semibold text-white">Lifecycle Rules</h3>
        </div>
        <p className="text-sm text-[#c4bbd3] mb-4">
          Define automatic actions for files in this bucket (JSON format).
        </p>
        <textarea
          value={lifecycleRules}
          onChange={(e) => setLifecycleRules(e.target.value)}
          rows={8}
          className="w-full px-4 py-3 rounded-xl border border-white/[0.1] bg-white/[0.03] text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#6b21ef]/50 font-mono text-sm"
          placeholder={'[\n  {\n    "name": "Delete old files",\n    "prefix": "temp/",\n    "action": "delete",\n    "daysAfterCreation": 30\n  }\n]'}
        />
        <Button
          onClick={handleSaveLifecycle}
          disabled={updateMutation.isPending}
          size="sm"
          className="mt-4"
        >
          Save Lifecycle Rules
        </Button>
      </div>
    </div>
  );
}
