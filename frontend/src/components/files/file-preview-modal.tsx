"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client";
import { formatBytes } from "@/lib/utils";
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
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Move,
} from "lucide-react";

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
  previewType: "image" | "pdf" | "video" | "audio" | "text" | "download";
}

interface FilePreviewModalProps {
  file: FileItem;
  bucketId: string;
  onClose: () => void;
}

const getPreviewIcon = (previewType: string) => {
  switch (previewType) {
    case "image":
      return FileImage;
    case "video":
      return FileVideo;
    case "audio":
      return FileAudio;
    case "text":
    case "pdf":
      return FileText;
    default:
      return File;
  }
};

// Image zoom and pan component
function ImageViewer({ src, alt }: { src: string; alt: string }) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const MIN_SCALE = 0.5;
  const MAX_SCALE = 5;
  const ZOOM_STEP = 0.25;

  const handleZoomIn = useCallback(() => {
    setScale((prev) => Math.min(prev + ZOOM_STEP, MAX_SCALE));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale((prev) => Math.max(prev - ZOOM_STEP, MIN_SCALE));
  }, []);

  const handleReset = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    setScale((prev) => Math.min(Math.max(prev + delta, MIN_SCALE), MAX_SCALE));
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (scale > 1) {
        setIsDragging(true);
        setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
      }
    },
    [scale, position]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y,
        });
      }
    },
    [isDragging, dragStart]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Double click to zoom
  const handleDoubleClick = useCallback(() => {
    if (scale === 1) {
      setScale(2);
    } else {
      handleReset();
    }
  }, [scale, handleReset]);

  return (
    <div className="relative w-full h-full flex flex-col">
      {/* Zoom Controls */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1.5 border border-white/10">
        <button
          onClick={handleZoomOut}
          className="p-1.5 hover:bg-white/10 rounded-full transition-colors"
          title="Zoom out"
        >
          <ZoomOut className="h-4 w-4 text-white" />
        </button>
        <span className="text-sm text-white min-w-[50px] text-center font-medium">
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={handleZoomIn}
          className="p-1.5 hover:bg-white/10 rounded-full transition-colors"
          title="Zoom in"
        >
          <ZoomIn className="h-4 w-4 text-white" />
        </button>
        <div className="w-px h-4 bg-white/20" />
        <button
          onClick={handleReset}
          className="p-1.5 hover:bg-white/10 rounded-full transition-colors"
          title="Reset zoom"
        >
          <RotateCcw className="h-4 w-4 text-white" />
        </button>
        {scale > 1 && (
          <>
            <div className="w-px h-4 bg-white/20" />
            <Move className="h-4 w-4 text-white/60" />
            <span className="text-xs text-white/60">Drag to pan</span>
          </>
        )}
      </div>

      {/* Image Container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden flex items-center justify-center"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        style={{
          cursor: scale > 1 ? (isDragging ? "grabbing" : "grab") : "zoom-in",
        }}
      >
        <img
          ref={imageRef}
          src={src}
          alt={alt}
          className="max-w-full max-h-full object-contain rounded-lg shadow-lg select-none"
          style={{
            transform: `scale(${scale}) translate(${position.x / scale}px, ${
              position.y / scale
            }px)`,
            transition: isDragging ? "none" : "transform 0.2s ease-out",
          }}
          draggable={false}
        />
      </div>

      {/* Hint */}
      <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-white/40">
        Scroll to zoom, double-click to toggle zoom, drag to pan when zoomed
      </p>
    </div>
  );
}

// Text content viewer
function TextViewer({ url }: { url: string }) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchContent = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(url, {
          mode: "cors",
          credentials: "omit",
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const text = await response.text();
        if (isMounted) {
          setContent(text);
        }
      } catch (err) {
        if (isMounted) {
          // Try without CORS as fallback (may work for same-origin)
          try {
            const response = await fetch(url);
            const text = await response.text();
            setContent(text);
          } catch {
            setError(`Failed to load content: ${(err as Error).message}`);
          }
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchContent();

    return () => {
      isMounted = false;
    };
  }, [url]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 text-[#ee4f27] animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertCircle className="h-10 w-10 text-amber-400" />
        <p className="text-[#c4bbd3] text-center">{error}</p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#ee4f27] hover:underline text-sm"
        >
          Open in new tab instead
        </a>
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-auto rounded-lg border border-white/[0.1] bg-[#0e0918]">
      <pre className="p-4 text-sm text-[#c4bbd3] font-mono whitespace-pre-wrap break-words">
        {content}
      </pre>
    </div>
  );
}

// PDF viewer with fallback
function PdfViewer({ url, filename }: { url: string; filename: string }) {
  const [useIframe, setUseIframe] = useState(true);
  const [loadError, setLoadError] = useState(false);

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <FileText className="h-16 w-16 text-[#c4bbd3]/30" />
        <p className="text-white font-medium">PDF preview unavailable</p>
        <p className="text-sm text-[#c4bbd3]">
          Your browser may not support embedded PDFs
        </p>
        <div className="flex gap-3">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#ee4f27] text-white hover:bg-[#ee4f27]/90 transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
            Open in new tab
          </a>
          <a
            href={url}
            download={filename}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 text-white hover:bg-white/5 transition-colors"
          >
            <Download className="h-4 w-4" />
            Download
          </a>
        </div>
      </div>
    );
  }

  if (useIframe) {
    return (
      <iframe
        src={url}
        className="w-full h-full rounded-lg border border-white/[0.1] bg-white"
        title={filename}
        onError={() => setLoadError(true)}
      />
    );
  }

  // Fallback to object tag
  return (
    <object
      data={url}
      type="application/pdf"
      className="w-full h-full rounded-lg"
    >
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-[#c4bbd3]">PDF cannot be displayed</p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#ee4f27] hover:underline"
        >
          Open in new tab
        </a>
      </div>
    </object>
  );
}

export function FilePreviewModal({
  file,
  bucketId,
  onClose,
}: FilePreviewModalProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const {
    data: preview,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["file-preview", bucketId, file.id],
    queryFn: async () => {
      const { data } = await apiClient.get<PreviewData>(
        `/admin/buckets/${bucketId}/files/${file.id}/preview`
      );
      return data;
    },
  });

  // Handle keyboard events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isFullscreen) {
          setIsFullscreen(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, isFullscreen]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const handleDownload = () => {
    if (preview?.url) {
      const link = document.createElement("a");
      link.href = preview.url;
      link.download = preview.originalName;
      link.click();
    }
  };

  const handleOpenInNewTab = () => {
    if (preview?.url) {
      window.open(preview.url, "_blank");
    }
  };

  const PreviewIcon = preview ? getPreviewIcon(preview.previewType) : File;

  // Use portal to render at document root with highest z-index
  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={`relative bg-[#1a1025] border border-white/[0.1] rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all duration-300 ${
          isFullscreen
            ? "w-[98vw] h-[98vh]"
            : "w-[90vw] max-w-5xl h-[85vh] max-h-[800px]"
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
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
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
        <div className="flex-1 overflow-hidden flex items-center justify-center p-4 bg-black/20">
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
                  {(error as Error).message || "An error occurred"}
                </p>
              </div>
              <Button variant="outline" onClick={handleDownload}>
                <Download className="mr-2 h-4 w-4" />
                Download Instead
              </Button>
            </div>
          ) : preview ? (
            <>
              {/* Image Preview with Zoom/Pan */}
              {preview.previewType === "image" && (
                <ImageViewer src={preview.url} alt={preview.originalName} />
              )}

              {/* PDF Preview */}
              {preview.previewType === "pdf" && (
                <PdfViewer url={preview.url} filename={preview.originalName} />
              )}

              {/* Video Preview */}
              {preview.previewType === "video" && (
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
              {preview.previewType === "audio" && (
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
              {preview.previewType === "text" && (
                <TextViewer url={preview.url} />
              )}

              {/* Fallback - Download */}
              {preview.previewType === "download" && (
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
    </div>,
    document.body
  );
}
