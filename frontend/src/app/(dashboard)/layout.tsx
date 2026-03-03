'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { useSSE } from '@/hooks/use-sse';
import { useKeyboardShortcuts, useShortcutsDialog } from '@/hooks/use-keyboard-shortcuts';
import { KeyboardShortcutsDialog } from '@/components/keyboard-shortcuts-dialog';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const { isOpen: shortcutsOpen, toggle: toggleShortcuts, close: closeShortcuts } = useShortcutsDialog();

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      router.push('/login');
    } else {
      setIsAuthenticated(true);
    }
  }, [router]);

  // Connect to SSE for real-time updates
  useSSE();

  // Global keyboard shortcuts
  const shortcuts = useMemo(
    () => ({
      '?': toggleShortcuts,
      '/': () => {
        const searchInput = document.querySelector<HTMLInputElement>(
          'input[placeholder*="Search"], input[placeholder*="search"]',
        );
        if (searchInput) searchInput.focus();
      },
      Escape: () => {
        if (shortcutsOpen) closeShortcuts();
      },
    }),
    [toggleShortcuts, closeShortcuts, shortcutsOpen],
  );
  useKeyboardShortcuts(shortcuts);

  if (!isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0e0918]">
        <div className="relative">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#ee4f27]/30 border-t-[#ee4f27]" />
          <div className="absolute inset-0 h-10 w-10 animate-pulse rounded-full bg-[#ee4f27]/10" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#0e0918]">
      <Sidebar />
      <main className="flex-1 overflow-auto p-8">
        <div className="mx-auto max-w-7xl animate-fade-in">{children}</div>
      </main>
      <KeyboardShortcutsDialog isOpen={shortcutsOpen} onClose={closeShortcuts} />
    </div>
  );
}
