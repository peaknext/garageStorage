import * as React from 'react';
import { cn } from '@/lib/utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  ref?: React.Ref<HTMLDivElement>;
}

function Card({ className, ref, ...props }: CardProps) {
  return (
    <div
      ref={ref}
      className={cn(
        'rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl text-card-foreground shadow-[0_8px_32px_rgba(0,0,0,0.4)] transition-all duration-300',
        'bg-gradient-to-br from-white/[0.05] via-transparent to-transparent',
        '[background-image:radial-gradient(ellipse_at_top_left,rgba(107,33,239,0.08)_0%,transparent_50%),radial-gradient(ellipse_at_bottom_right,rgba(238,79,39,0.05)_0%,transparent_50%)]',
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ref, ...props }: CardProps) {
  return (
    <div
      ref={ref}
      className={cn('flex flex-col space-y-1.5 p-6', className)}
      {...props}
    />
  );
}

interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  ref?: React.Ref<HTMLHeadingElement>;
}

function CardTitle({ className, ref, ...props }: CardTitleProps) {
  return (
    <h3
      ref={ref}
      className={cn(
        'text-xl font-bold leading-none tracking-tight text-white',
        className,
      )}
      {...props}
    />
  );
}

interface CardDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {
  ref?: React.Ref<HTMLParagraphElement>;
}

function CardDescription({ className, ref, ...props }: CardDescriptionProps) {
  return (
    <p
      ref={ref}
      className={cn('text-sm text-[#c4bbd3]', className)}
      {...props}
    />
  );
}

function CardContent({ className, ref, ...props }: CardProps) {
  return (
    <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
  );
}

function CardFooter({ className, ref, ...props }: CardProps) {
  return (
    <div
      ref={ref}
      className={cn('flex items-center p-6 pt-0', className)}
      {...props}
    />
  );
}

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
