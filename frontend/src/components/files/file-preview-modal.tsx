'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api-client';
import { formatBytes } from '@/lib/utils';
import {
  X,
  Download,
  ExternalLink,
  FileImage,
  FileVideo,
  FileAudio,
  FileText,
  File,
  Loader2,
  AlertCircle,
  Maximize2,
  Minimize2,
} from 'lucide-react';

interface FileItem {
  id: string;
  key: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

interface PreviewData {
  url: string;
  mimeType: string;
  originalName: string;
  sizeBytes: number;
  previewType: 'image' | 'pdf' | 'video' | 'audio' | 'text' | 'download';
}

interface FilePreviewModalProps {
  file: FileItem;
  bucketId: string;
  onClose: () => void;
}

const getPreviewIcon = (previewType: string) => {
  switch (previewType) {
    case 'image':
      return FileImage;
    case 'video':
      return FileVideo;
    case 'audio':
      return FileAudio;
    case 'text':
    case 'pdf':
      return FileText;
    default:
      return File;
  }
};

export function FilePreviewModal({ file, bucketId, onClose }: FilePreviewModalProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [textContent, setTextContent] = useState<string | null>(null);

  const { data: preview, isLoading, error } = useQuery({
    queryKey: ['file-preview', bucketId, file.id],
    queryFn: async () => {
      const { data } = await apiClient.get<PreviewData>(
        `/admin/buckets/${bucketId}/files/${file.id}/preview`
      );
      return data;
    },
  });

  // Fetch text content for text files
  useEffect(() => {
    if (preview?.previewType === 'text' && preview.url) {
      fetch(preview.url)
        .then((res) => res.text())
        .then(setTextContent)
        .catch(() => setTextContent('Failed to load text content'));
    }
  }, [preview]);

  // Handle keyboard events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFullscreen) {
          setIsFullscreen(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isFullscreen]);

  const handleDownload = () => {
    if (preview?.url) {
      window.open(preview.url, '_blank');
    }
  };

  const handleOpenInNewTab = () => {
    if (preview?.url) {
      window.open(preview.url, '_blank');
    }
  };

  const PreviewIcon = preview ? getPreviewIcon(preview.previewType) : File;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={`relative bg-[#1a1025] border border-white/[0.1] rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all duration-300 ${
          isFullscreen
            ? 'w-[98vw] h-[98vh]'
            : 'w-[90vw] max-w-5xl h-[85vh] max-h-[800px]'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08] bg-white/[0.02]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#ee4f27]/20 to-[#ee4f27]/5 border border-white/[0.08] flex-shrink-0">
              <PreviewIcon className="h-5 w-5 text-[#ee4f27]" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-white truncate">
                {file.originalName}
              </h3>
              <p className="text-sm text-[#c4bbd3]">
                {file.mimeType} • {formatBytes(file.sizeBytes)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="h-9 w-9"
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleOpenInNewTab}
              className="h-9 w-9"
              title="Open in new tab"
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDownload}
              className="h-9 w-9"
              title="Download"
            >
              <Download className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-9 w-9"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-black/20">
          {isLoading ? (
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-10 w-10 text-[#ee4f27] animate-spin" />
              <p className="text-[#c4bbd3]">Loading preview...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <AlertCircle className="h-12 w-12 text-red-400" />
              <div>
                <p className="text-white font-medium">Failed to load preview</p>
                <p className="text-sm text-[#c4bbd3] mt-1">
                  {(error as Error).message || 'An error occurred'}
                </p>
              </div>
              <Button variant="outline" onClick={handleDownload}>
                <Download className="mr-2 h-4 w-4" />
                Download Instead
              </Button>
            </div>
          ) : preview ? (
            <>
              {/* Image Preview */}
              {preview.previewType === 'image' && (
                <img
                  src={preview.url}
                  alt={preview.originalName}
                  className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
                />
              )}

              {/* PDF Preview */}
              {preview.previewType === 'pdf' && (
                <iframe
                  src={preview.url}
                  className="w-full h-full rounded-lg border border-white/[0.1]"
                  title={preview.originalName}
                />
              )}

              {/* Video Preview */}
              {preview.previewType === 'video' && (
                <video
                  src={preview.url}
                  controls
                  autoPlay={false}
                  className="max-w-full max-h-full rounded-lg shadow-lg"
                >
                  Your browser does not support video playback.
                </video>
              )}

              {/* Audio Preview */}
              {preview.previewType === 'audio' && (
                <div className="flex flex-col items-center gap-6 p-8">
                  <div className="w-32 h-32 rounded-2xl bg-gradient-to-br from-[#6b21ef]/30 to-[#ee4f27]/30 flex items-center justify-center">
                    <FileAudio className="h-16 w-16 text-white/80" />
                  </div>
                  <audio src={preview.url} controls className="w-full max-w-md">
                    Your browser does not support audio playback.
                  </audio>
                </div>
              )}

              {/* Text Preview */}
              {preview.previewType === 'text' && (
                <div className="w-full h-full overflow-auto rounded-lg border border-white/[0.1] bg-[#0e0918]">
                  <pre className="p-4 text-sm text-[#c4bbd3] font-mono whitespace-pre-wrap">
                    {textContent || 'Loading text content...'}
                  </pre>
                </div>
              )}

              {/* Fallback - Download */}
              {preview.previewType === 'download' && (
                <div className="flex flex-col items-center gap-6 text-center">
                  <div className="w-24 h-24 rounded-2xl bg-white/[0.05] border border-white/[0.1] flex items-center justify-center">
                    <File className="h-12 w-12 text-[#c4bbd3]" />
                  </div>
                  <div>
                    <p className="text-white font-medium text-lg">
                      {preview.originalName}
                    </p>
                    <p className="text-sm text-[#c4bbd3] mt-1">
                      {preview.mimeType} • {formatBytes(preview.sizeBytes)}
                    </p>
                    <p className="text-sm text-[#c4bbd3] mt-4">
                      Preview not available for this file type
                    </p>
                  </div>
                  <Button onClick={handleDownload}>
                    <Download className="mr-2 h-4 w-4" />
                    Download File
                  </Button>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
