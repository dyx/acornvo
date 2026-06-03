import * as React from 'react'
import * as ToastPrimitives from '@radix-ui/react-toast'
import { cva, type VariantProps } from 'class-variance-authority'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export const ToastProvider = ToastPrimitives.Provider

export const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    className={cn(
      'fixed top-10 left-1/2 -translate-x-1/2 z-[9999] m-4 flex max-h-screen w-96 flex-col gap-2 outline-none',
      className
    )}
    {...props}
  />
))
ToastViewport.displayName = ToastPrimitives.Viewport.displayName

const toastVariants = cva(
  'pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-md border p-4 pr-8 shadow-md transition-all data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-top-8 data-[state=closed]:slide-out-to-top-8 data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
  {
    variants: {
      variant: {
        default:
          'border-[color:var(--color-line-2)] bg-[color:var(--color-paper)] text-[color:var(--color-ink)]',
        destructive:
          'border-[color:var(--color-berry)] bg-[color:var(--color-paper)] text-[color:var(--color-ink)]'
      }
    },
    defaultVariants: { variant: 'default' }
  }
)

import { XCircle } from 'lucide-react'

export const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> & VariantProps<typeof toastVariants>
>(({ className, variant, children, ...props }, ref) => (
  <ToastPrimitives.Root
    ref={ref}
    className={cn(toastVariants({ variant }), className)}
    {...props}
  >
    {variant === 'destructive' && (
      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--color-berry)]" />
    )}
    {children}
  </ToastPrimitives.Root>
))
Toast.displayName = ToastPrimitives.Root.displayName

export const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close> & { variant?: ToastVariant }
>(({ className, variant, ...props }, ref) => {
  if (variant === 'destructive') return null;
  return (
    <ToastPrimitives.Close
      ref={ref}
      toast-close=""
      className={cn('absolute right-2 top-2 rounded-md p-1 opacity-60 hover:opacity-100', className)}
      {...props}
    >
      <X className="h-4 w-4" />
    </ToastPrimitives.Close>
  );
})
ToastClose.displayName = ToastPrimitives.Close.displayName

export const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title ref={ref} className={cn('text-sm font-medium', className)} {...props} />
))
ToastTitle.displayName = ToastPrimitives.Title.displayName

export const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description
    ref={ref}
    className={cn('text-sm text-[color:var(--color-ink-3)]', className)}
    {...props}
  />
))
ToastDescription.displayName = ToastPrimitives.Description.displayName

export type ToastVariant = VariantProps<typeof toastVariants>['variant']
