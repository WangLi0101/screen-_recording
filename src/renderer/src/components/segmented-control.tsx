import * as React from 'react'
import { cn } from '@renderer/lib/utils'

export interface SegmentedOption<T extends string | number> {
  value: T
  label: React.ReactNode
}

interface Props<T extends string | number> {
  value: T
  options: Array<SegmentedOption<T>>
  onChange: (value: T) => void
  ariaLabel?: string
  className?: string
  disabled?: boolean
}

export function SegmentedControl<T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
  className,
  disabled
}: Props<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn('inline-flex items-center gap-0.5 rounded-full bg-surface-container-high p-[3px]', className)}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              'h-8 rounded-full px-4 text-[13.5px] font-medium whitespace-nowrap outline-none transition-[background-color,color,box-shadow] duration-200 ease-[var(--ease)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-[0.38]',
              active
                ? 'bg-primary-container text-on-primary-container shadow-[0_1px_2px_rgba(0,0,0,0.12)]'
                : 'text-on-surface-variant hover:bg-state-hover hover:text-on-surface'
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}