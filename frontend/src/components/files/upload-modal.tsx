'use client';

import { useState, useCallback, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { apiClient } from '@/lib/api-client';
import { formatBytes } from '@/lib/utils';
import {
  Upload,
  X,
  File,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';

interface UploadModalProps {
  bucketId: string;
  onClose: () => void;
  onSuccess?: () => void;
}

interface FileUpload {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
}

export function UploadModal({ bucketId, onClose, onSuccess }: UploadModalProps) {
  const queryClient = useQueryClient();
  const [files, setFiles] = useState<FileUpload[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    addFiles(droppedFiles);
  }, []);

  const addFiles = (newFiles: File[]) => {
    const uploads: FileUpload[] = newFiles.map((file) => ({
      file,
      progress: 0,
      status: 'pending',
    }));
    setFiles((prev) => [...prev, ...uploads]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(Array.from(e.target.files));
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadFile = async (fileUpload: FileUpload, index: number) => {
    const { file } = fileUpload;

    try {
      setFiles((prev) =>
        prev.map((f, i) =>
          i === index ? { ...f, status: 'uploading', progress: 10 } : f
        )
      );

      // For files < 10MB, use direct upload
      if (file.size < 10 * 1024 * 1024) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('isPublic', String(isPublic));

        await apiClient.post(`/admin/buckets/${bucketId}/files/upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (progressEvent: { loaded: number; total?: number }) => {
            const progress = progressEvent.total
              ? Math.round((progressEvent.loaded * 100) / progressEvent.total)
              : 0;
            setFiles((prev) =>
              prev.map((f, i) => (i === index ? { ...f, progress } : f))
            );
          },
        });
      } else {
        // For larger files, use presigned URL
        setFiles((prev) =>
          prev.map((f, i) => (i === index ? { ...f, progress: 20 } : f))
        );

        // Get presigned URL
        const { data: presigned } = await apiClient.post<{ uploadUrl: string; uploadId: string }>(
          `/admin/buckets/${bucketId}/files/presigned-upload`,
          {
            contentType: file.type || 'application/octet-stream',
            contentLength: file.size,
            metadata: { originalName: file.name },
            isPublic,
          }
        );

        setFiles((prev) =>
          prev.map((f, i) => (i === index ? { ...f, progress: 30 } : f))
        );

        // Upload to S3
        await fetch(presigned.uploadUrl, {
          method: 'PUT',
          body: file,
          headers: {
            'Content-Type': file.type || 'application/octet-stream',
          },
        });

        setFiles((prev) =>
          prev.map((f, i) => (i === index ? { ...f, progress: 80 } : f))
        );

        // Confirm upload
        await apiClient.post(`/admin/buckets/${bucketId}/files/confirm-upload`, {
          uploadId: presigned.uploadId,
        });
      }

      setFiles((prev) =>
        prev.map((f, i) =>
          i === index ? { ...f, status: 'success', progress: 100 } : f
        )
      );
    } catch (error: any) {
      setFiles((prev) =>
        prev.map((f, i) =>
          i === index
            ? { ...f, status: 'error', error: error.message || 'Upload failed' }
            : f
        )
      );
    }
  };

  const uploadAllFiles = async () => {
    const CONCURRENCY = 3;
    const pendingIndices = files
      .map((f, i) => (f.status === 'pending' ? i : -1))
      .filter((i) => i !== -1);

    // Process in batches of CONCURRENCY
    for (let batch = 0; batch < pendingIndices.length; batch += CONCURRENCY) {
      const batchIndices = pendingIndices.slice(batch, batch + CONCURRENCY);
      await Promise.all(
        batchIndices.map((i) => uploadFile(files[i], i))
      );
    }

    queryClient.invalidateQueries({ queryKey: ['bucket-files', bucketId] });
    onSuccess?.();
  };

  const allDone = files.length > 0 && files.every((f) => f.status !== 'pending' && f.status !== 'uploading');
  const hasFiles = files.length > 0;
  const isUploading = files.some((f) => f.status === 'uploading');

  return (
    <Card className="animate-scale-in">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#6b21ef]/20 to-[#6b21ef]/5 border border-[#6b21ef]/20">
              <Upload className="h-5 w-5 text-[#6b21ef]" />
            </div>
            <div>
              <CardTitle>Upload Files</CardTitle>
              <CardDescription>
                Drag & drop files or click to select
              </CardDescription>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Drop Zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`
            border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
            transition-all duration-200
            ${
              isDragging
                ? 'border-[#6b21ef] bg-[#6b21ef]/10'
                : 'border-white/10 hover:border-white/20 bg-white/[0.02]'
            }
          `}
        >
          <Upload className="h-10 w-10 mx-auto mb-3 text-[#c4bbd3]/50" />
          <p className="text-white font-medium">
            Drop files here or click to browse
          </p>
          <p className="text-sm text-[#c4bbd3]/70 mt-1">
            Files under 10MB will be uploaded directly
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>

        {/* Public Toggle */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.08]">
          <input
            type="checkbox"
            id="isPublic"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-white/[0.05] text-[#ee4f27] focus:ring-[#ee4f27]"
          />
          <label htmlFor="isPublic" className="text-sm text-white">
            Make files publicly accessible
          </label>
        </div>

        {/* File List */}
        {hasFiles && (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {files.map((fileUpload, index) => (
              <div
                key={index}
                className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.08]"
              >
                <File className="h-5 w-5 text-[#c4bbd3] flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">
                    {fileUpload.file.name}
                  </p>
                  <p className="text-xs text-[#c4bbd3]/70">
                    {formatBytes(fileUpload.file.size)}
                  </p>
                  {fileUpload.status === 'uploading' && (
                    <Progress value={fileUpload.progress} className="mt-2 h-1" />
                  )}
                  {fileUpload.status === 'error' && (
                    <p className="text-xs text-red-400 mt-1">{fileUpload.error}</p>
                  )}
                </div>
                <div className="flex-shrink-0">
                  {fileUpload.status === 'pending' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeFile(index)}
                      className="h-8 w-8"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                  {fileUpload.status === 'success' && (
                    <CheckCircle className="h-5 w-5 text-emerald-400" />
                  )}
                  {fileUpload.status === 'error' && (
                    <AlertCircle className="h-5 w-5 text-red-400" />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Upload Summary */}
        {hasFiles && (
          <div className="flex items-center gap-4 text-xs text-[#c4bbd3]/70">
            <span>{files.filter((f) => f.status === 'success').length}/{files.length} completed</span>
            {files.some((f) => f.status === 'error') && (
              <span className="text-red-400">{files.filter((f) => f.status === 'error').length} failed</span>
            )}
            <span>{formatBytes(files.reduce((acc, f) => acc + f.file.size, 0))} total</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onClose}>
            {allDone ? 'Close' : 'Cancel'}
          </Button>
          {!allDone && (
            <Button
              onClick={uploadAllFiles}
              disabled={!hasFiles || isUploading}
            >
              {isUploading ? 'Uploading...' : `Upload ${files.length} file${files.length !== 1 ? 's' : ''}`}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
