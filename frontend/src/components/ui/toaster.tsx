'use client';

import * as React from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { cn } from '@/lib/utils';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { useToast, ToastContextProvider } from '@/hooks/use-toast';

const ToastProvider = ToastPrimitive.Provider;

interface ToastViewportProps extends React.ComponentPropsWithoutRef<typeof ToastPrimitive.Viewport> {
  ref?: React.Ref<React.ElementRef<typeof ToastPrimitive.Viewport>>;
}

function ToastViewport({ className, ref, ...props }: ToastViewportProps) {
  return (
    <ToastPrimitive.Viewport
      ref={ref}
      className={cn(
        'fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]',
        className,
      )}
      {...props}
    />
  );
}

interface ToastProps extends React.ComponentPropsWithoutRef<typeof ToastPrimitive.Root> {
  variant?: 'default' | 'destructive' | 'success';
  ref?: React.Ref<React.ElementRef<typeof ToastPrimitive.Root>>;
}

function Toast({ className, variant = 'default', ref, ...props }: ToastProps) {
  return (
    <ToastPrimitive.Root
      ref={ref}
      className={cn(
        'group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-xl p-6 pr-8 shadow-lg transition-all animate-fade-in',
        'backdrop-blur-xl border',
        variant === 'default' && 'border-white/[0.1] bg-white/[0.05] text-white',
        variant === 'success' && 'border-emerald-500/30 bg-emerald-500/10 text-white shadow-[0_0_20px_rgba(16,185,129,0.2)]',
        variant === 'destructive' && 'border-red-500/30 bg-red-500/10 text-white',
        className,
      )}
      {...props}
    />
  );
}

interface ToastCloseProps extends React.ComponentPropsWithoutRef<typeof ToastPrimitive.Close> {
  ref?: React.Ref<React.ElementRef<typeof ToastPrimitive.Close>>;
}

function ToastClose({ className, ref, ...props }: ToastCloseProps) {
  return (
    <ToastPrimitive.Close
      ref={ref}
      className={cn(
        'absolute right-3 top-3 rounded-lg p-1.5 text-white/50 opacity-0 transition-all hover:text-white hover:bg-white/[0.1] focus:opacity-100 focus:outline-none group-hover:opacity-100',
        className,
      )}
      data-toast-close=""
      {...props}
    >
      <X className="h-4 w-4" />
    </ToastPrimitive.Close>
  );
}

interface ToastTitleProps extends React.ComponentPropsWithoutRef<typeof ToastPrimitive.Title> {
  ref?: React.Ref<React.ElementRef<typeof ToastPrimitive.Title>>;
}

function ToastTitle({ className, ref, ...props }: ToastTitleProps) {
  return (
    <ToastPrimitive.Title
      ref={ref}
      className={cn('text-sm font-semibold text-white', className)}
      {...props}
    />
  );
}

interface ToastDescriptionProps extends React.ComponentPropsWithoutRef<typeof ToastPrimitive.Description> {
  ref?: React.Ref<React.ElementRef<typeof ToastPrimitive.Description>>;
}

function ToastDescription({ className, ref, ...props }: ToastDescriptionProps) {
  return (
    <ToastPrimitive.Description
      ref={ref}
      className={cn('text-sm text-[#c4bbd3]', className)}
      {...props}
    />
  );
}

function ToastList() {
  const { toasts, dismiss } = useToast();

  const getIcon = (variant: string) => {
    switch (variant) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-emerald-400" />;
      case 'destructive':
        return <AlertCircle className="h-5 w-5 text-red-400" />;
      default:
        return <Info className="h-5 w-5 text-blue-400" />;
    }
  };

  return (
    <>
      {toasts.map((t) => (
        <Toast key={t.id} variant={t.variant}>
          <div className="flex items-start gap-3">
            {getIcon(t.variant)}
            <div className="grid gap-1">
              <ToastTitle>{t.title}</ToastTitle>
              {t.description && (
                <ToastDescription>{t.description}</ToastDescription>
              )}
            </div>
          </div>
          <ToastClose onClick={() => dismiss(t.id)} />
        </Toast>
      ))}
    </>
  );
}

export function Toaster() {
  return (
    <ToastProvider>
      <ToastList />
      <ToastViewport />
    </ToastProvider>
  );
}

export { Toast, ToastClose, ToastTitle, ToastDescription, ToastContextProvider };
