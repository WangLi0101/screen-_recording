import * as React from 'react'
import { cn } from '@renderer/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      className={cn(
        'flex h-10 w-full min-w-0 rounded-m3-sm border border-outline bg-surface-container-low px-3.5 text-sm text-on-surface outline-none transition-[border-color,box-shadow,background-color] duration-150 ease-[var(--ease)] placeholder:text-on-surface-variant hover:border-on-surface focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-[0.38]',
        className
      )}
      {...props}
    />
  )
}

export { Input }