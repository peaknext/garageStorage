import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.03] px-4 py-2 text-sm text-white',
          'ring-offset-background transition-all duration-200',
          'file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-white',
          'placeholder:text-[#c4bbd3]/60',
          'hover:border-white/[0.2] hover:bg-white/[0.05]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ee4f27]/50 focus-visible:ring-offset-0',
          'focus-visible:border-[#ee4f27]/50 focus-visible:bg-white/[0.05]',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };
