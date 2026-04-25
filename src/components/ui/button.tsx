import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--color-acorn)] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary:
          'bg-[color:var(--color-acorn)] text-[color:var(--color-paper)] shadow-sm hover:brightness-105',
        outline:
          'bg-[color:var(--color-paper)] text-[color:var(--color-ink)] border border-[color:var(--color-line-2)] hover:bg-[color:var(--color-paper-2)]',
        ghost:
          'text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-paper-2)]',
        destructive:
          'bg-[color:var(--color-berry)] text-[color:var(--color-paper)] hover:brightness-105'
      },
      size: {
        sm: 'h-8 px-3',
        md: 'h-10 px-4',
        lg: 'h-11 px-5 text-base',
        icon: 'h-9 w-9'
      }
    },
    defaultVariants: { variant: 'primary', size: 'md' }
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { buttonVariants }
