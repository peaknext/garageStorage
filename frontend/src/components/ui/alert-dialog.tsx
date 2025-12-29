'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog';
import { Button } from './button';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  CheckCircle,
  Info,
  Trash2,
  Loader2,
} from 'lucide-react';

export type AlertDialogVariant = 'info' | 'warning' | 'destructive' | 'success';

interface AlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  variant?: AlertDialogVariant;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  loading?: boolean;
  showCancel?: boolean;
}

const variantConfig = {
  info: {
    icon: Info,
    iconClass: 'text-blue-400',
    bgClass: 'bg-blue-500/10',
    borderClass: 'border-blue-500/20',
    confirmVariant: 'default' as const,
  },
  warning: {
    icon: AlertTriangle,
    iconClass: 'text-amber-400',
    bgClass: 'bg-amber-500/10',
    borderClass: 'border-amber-500/20',
    confirmVariant: 'default' as const,
  },
  destructive: {
    icon: Trash2,
    iconClass: 'text-red-400',
    bgClass: 'bg-red-500/10',
    borderClass: 'border-red-500/20',
    confirmVariant: 'destructive' as const,
  },
  success: {
    icon: CheckCircle,
    iconClass: 'text-emerald-400',
    bgClass: 'bg-emerald-500/10',
    borderClass: 'border-emerald-500/20',
    confirmVariant: 'default' as const,
  },
};

export function AlertDialog({
  open,
  onOpenChange,
  title,
  description,
  variant = 'info',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  loading = false,
  showCancel = true,
}: AlertDialogProps) {
  const config = variantConfig[variant];
  const Icon = config.icon;

  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  const handleConfirm = () => {
    onConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <div className="flex items-start gap-4">
            <div
              className={cn(
                'flex h-12 w-12 shrink-0 items-center justify-center rounded-full border',
                config.bgClass,
                config.borderClass
              )}
            >
              <Icon className={cn('h-6 w-6', config.iconClass)} />
            </div>
            <div className="flex-1 space-y-1.5">
              <DialogTitle>{title}</DialogTitle>
              {description && (
                <DialogDescription>{description}</DialogDescription>
              )}
            </div>
          </div>
        </DialogHeader>
        <DialogFooter className="mt-4 gap-2 sm:gap-2">
          {showCancel && (
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={loading}
            >
              {cancelLabel}
            </Button>
          )}
          <Button
            type="button"
            variant={config.confirmVariant}
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Export a simpler confirm dialog hook for common use cases
export interface ConfirmDialogState {
  isOpen: boolean;
  title: string;
  description?: string;
  variant: AlertDialogVariant;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  loading: boolean;
}

export function useConfirmDialog() {
  const [state, setState] = React.useState<ConfirmDialogState>({
    isOpen: false,
    title: '',
    description: undefined,
    variant: 'info',
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    onConfirm: () => {},
    loading: false,
  });

  const confirm = React.useCallback(
    (options: {
      title: string;
      description?: string;
      variant?: AlertDialogVariant;
      confirmLabel?: string;
      cancelLabel?: string;
    }): Promise<boolean> => {
      return new Promise((resolve) => {
        setState({
          isOpen: true,
          title: options.title,
          description: options.description,
          variant: options.variant || 'info',
          confirmLabel: options.confirmLabel || 'Confirm',
          cancelLabel: options.cancelLabel || 'Cancel',
          onConfirm: () => {
            setState((prev) => ({ ...prev, isOpen: false }));
            resolve(true);
          },
          loading: false,
        });
      });
    },
    []
  );

  const close = React.useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const setLoading = React.useCallback((loading: boolean) => {
    setState((prev) => ({ ...prev, loading }));
  }, []);

  const ConfirmDialog = React.useCallback(
    () => (
      <AlertDialog
        open={state.isOpen}
        onOpenChange={(open) => {
          if (!open) {
            setState((prev) => ({ ...prev, isOpen: false }));
          }
        }}
        title={state.title}
        description={state.description}
        variant={state.variant}
        confirmLabel={state.confirmLabel}
        cancelLabel={state.cancelLabel}
        onConfirm={state.onConfirm}
        loading={state.loading}
      />
    ),
    [state]
  );

  return {
    confirm,
    close,
    setLoading,
    ConfirmDialog,
    isOpen: state.isOpen,
  };
}
