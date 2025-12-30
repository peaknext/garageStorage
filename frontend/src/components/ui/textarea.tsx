import * as React from 'react';

import { cn } from '@/lib/utils';

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  ref?: React.Ref<HTMLTextAreaElement>;
}

function Textarea({ className, ref, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(
        'flex min-h-[80px] w-full rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-sm text-white ring-offset-[#0e0918] placeholder:text-[#c4bbd3]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ee4f27] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      ref={ref}
      {...props}
    />
  );
}

export { Textarea };
