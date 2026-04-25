import * as React from 'react'
import { cn } from '@/lib/utils'

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type = 'text', ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      'flex h-10 w-full rounded-md border border-[color:var(--color-line-2)] bg-[color:var(--color-paper)] px-3 py-2 text-sm text-[color:var(--color-ink)] placeholder:text-[color:var(--color-ink-4)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--color-acorn)] disabled:cursor-not-allowed disabled:opacity-50',
      className
    )}
    {...props}
  />
))
Input.displayName = 'Input'
