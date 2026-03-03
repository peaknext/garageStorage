'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:9001/api/v1';

export function useSSE() {
  const queryClient = useQueryClient();
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    // EventSource doesn't support custom headers, so we pass token as query param
    const url = `${API_BASE_URL}/admin/events/stream?token=${encodeURIComponent(token)}`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    const invalidateFiles = () => {
      queryClient.invalidateQueries({ queryKey: ['bucket-files'] });
    };

    const invalidateAll = () => {
      queryClient.invalidateQueries({ queryKey: ['bucket-files'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      queryClient.invalidateQueries({ queryKey: ['applications'] });
    };

    eventSource.addEventListener('file.uploaded', invalidateFiles);
    eventSource.addEventListener('file.deleted', invalidateFiles);
    eventSource.addEventListener('file.restored', invalidateFiles);
    eventSource.addEventListener('thumbnail.generated', invalidateFiles);
    eventSource.addEventListener('policy.executed', invalidateAll);
    eventSource.addEventListener('quota.warning', invalidateAll);
    eventSource.addEventListener('quota.critical', invalidateAll);

    eventSource.onerror = () => {
      // SSE will auto-reconnect via retry header
    };

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [queryClient]);
}
