'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Keyboard } from 'lucide-react';
import { SHORTCUT_DESCRIPTIONS } from '@/hooks/use-keyboard-shortcuts';

interface KeyboardShortcutsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsDialog({ isOpen, onClose }: KeyboardShortcutsDialogProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      const handleEsc = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleEsc);
      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', handleEsc);
      };
    }
  }, [isOpen, onClose]);

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#1a1025] border border-white/[0.08] rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Keyboard className="h-5 w-5 text-[#6b21ef]" />
            <h2 className="text-lg font-semibold text-white">Keyboard Shortcuts</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/[0.05]">
            <X className="h-5 w-5 text-[#c4bbd3]" />
          </button>
        </div>
        <div className="space-y-2">
          {SHORTCUT_DESCRIPTIONS.map((s) => (
            <div
              key={s.key}
              className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/[0.02]"
            >
              <span className="text-sm text-[#c4bbd3]">{s.description}</span>
              <kbd className="px-2 py-0.5 rounded-md bg-white/[0.06] border border-white/[0.1] text-xs font-mono text-white">
                {s.key}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
