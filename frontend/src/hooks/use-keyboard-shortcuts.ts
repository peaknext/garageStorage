'use client';

import { useEffect, useState, useCallback } from 'react';

interface ShortcutMap {
  [key: string]: () => void;
}

export function useKeyboardShortcuts(shortcuts: ShortcutMap) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger when typing in inputs
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        // Only allow Escape in inputs
        if (e.key !== 'Escape') return;
      }

      let key = '';
      if (e.ctrlKey || e.metaKey) key += 'Ctrl+';
      if (e.shiftKey) key += 'Shift+';
      if (e.altKey) key += 'Alt+';
      key += e.key;

      const handler = shortcuts[key];
      if (handler) {
        e.preventDefault();
        handler();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
}

export const SHORTCUT_DESCRIPTIONS = [
  { key: '?', description: 'Show keyboard shortcuts' },
  { key: '/', description: 'Focus search' },
  { key: 'Escape', description: 'Close dialog / Deselect all' },
  { key: 'Delete', description: 'Delete selected files' },
  { key: 'Ctrl+a', description: 'Select all files' },
  { key: 'Ctrl+u', description: 'Upload files' },
];

export function useShortcutsDialog() {
  const [isOpen, setIsOpen] = useState(false);

  const toggle = useCallback(() => setIsOpen((v) => !v), []);
  const close = useCallback(() => setIsOpen(false), []);

  return { isOpen, toggle, close };
}
