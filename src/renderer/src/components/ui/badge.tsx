import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'
import { cn } from '@renderer/lib/utils'

const badgeVariants = cva(
  'inline-flex h-7 items-center gap-1.5 rounded-m3-sm border px-2.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'border-outline-variant bg-transparent text-on-surface-variant',
        ok: 'border-transparent bg-ok-container text-ok-text',
        warn: 'border-transparent bg-warn-container text-warn-text',
        error: 'border-transparent bg-error-container text-on-error-container',
        solid: 'border-transparent bg-black/70 text-white'
      }
    },
    defaultVariants: {
      variant: 'default'
    }
  }
)

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }