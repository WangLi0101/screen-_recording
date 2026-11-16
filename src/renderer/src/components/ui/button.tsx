import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'
import { cn } from '@renderer/lib/utils'

const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-full text-sm font-medium tracking-[0.1px] whitespace-nowrap outline-none transition-[background-color,color,box-shadow,transform] duration-200 ease-[var(--ease)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-[0.38] [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-surface-container-high text-on-surface hover:bg-surface-hover active:bg-surface-press',
        primary: 'bg-primary text-on-primary hover:bg-primary-hover active:bg-primary-active',
        secondary:
          'bg-secondary-container text-on-secondary-container hover:bg-[color-mix(in_srgb,var(--on-secondary-container)_8%,var(--secondary-container))]',
        ghost: 'bg-transparent text-primary hover:bg-primary-veil active:bg-primary-veil-strong',
        danger:
          'bg-transparent text-error hover:bg-error-container hover:text-on-error-container active:bg-[color-mix(in_srgb,var(--on-error-container)_10%,var(--error-container))]',
        quiet:
          'bg-transparent text-on-surface-variant hover:bg-state-hover hover:text-on-surface active:bg-state-press',
        outline:
          'border border-outline-variant bg-transparent text-on-surface hover:bg-state-hover active:bg-state-press'
      },
      size: {
        default: 'h-10 px-6',
        sm: 'h-8 gap-1.5 px-4 text-[13px]',
        lg: 'h-14 gap-2.5 px-8 text-[15px] font-semibold shadow-elevation-1',
        icon: 'size-10 p-0'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
)

export interface ButtonProps
  extends React.ComponentProps<'button'>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button'
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />
}

export { Button, buttonVariants }