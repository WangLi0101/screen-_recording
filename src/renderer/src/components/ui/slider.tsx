import * as SliderPrimitive from '@radix-ui/react-slider'
import * as React from 'react'
import { cn } from '@renderer/lib/utils'

function Slider({ className, ...props }: React.ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root
      className={cn(
        'relative flex w-full touch-none items-center select-none data-[disabled]:opacity-[0.38]',
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-surface-container-highest">
        <SliderPrimitive.Range className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block size-[18px] shrink-0 rounded-full bg-primary shadow-[0_1px_3px_rgba(0,0,0,0.4)] outline-none transition-shadow duration-150 hover:shadow-[0_0_0_8px_color-mix(in_srgb,var(--primary)_16%,transparent)] focus-visible:shadow-[0_0_0_8px_color-mix(in_srgb,var(--primary)_24%,transparent)] disabled:cursor-not-allowed" />
    </SliderPrimitive.Root>
  )
}

export { Slider }