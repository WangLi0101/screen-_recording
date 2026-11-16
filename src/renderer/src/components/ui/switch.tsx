import * as SwitchPrimitive from '@radix-ui/react-switch'
import * as React from 'react'
import { cn } from '@renderer/lib/utils'

function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'peer inline-flex h-8 w-[52px] shrink-0 items-center rounded-full border-2 border-outline bg-surface-container-highest ps-1 outline-none transition-[background-color,border-color] duration-200 ease-[var(--ease)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary data-[state=checked]:border-primary data-[state=checked]:bg-primary disabled:cursor-not-allowed disabled:opacity-[0.38]',
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'pointer-events-none block size-5 shrink-0 rounded-full bg-outline shadow-sm transition-transform duration-200 ease-[var(--ease)] data-[state=checked]:translate-x-5 data-[state=checked]:bg-on-primary'
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }