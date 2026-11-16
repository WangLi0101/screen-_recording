import * as TabsPrimitive from '@radix-ui/react-tabs'
import * as React from 'react'
import { cn } from '@renderer/lib/utils'

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root className={cn('flex flex-col', className)} {...props} />
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        'inline-flex h-10 w-fit items-center gap-0.5 rounded-full bg-surface-container-high p-[3px]',
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'inline-flex h-8 items-center justify-center gap-1 rounded-full px-4 text-[13.5px] font-medium whitespace-nowrap text-on-surface-variant outline-none transition-[background-color,color,box-shadow] duration-200 ease-[var(--ease)] hover:bg-state-hover hover:text-on-surface focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-[0.38] data-[state=active]:bg-primary-container data-[state=active]:text-on-primary-container data-[state=active]:shadow-[0_1px_2px_rgba(0,0,0,0.12)]',
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('outline-none', className)} {...props} />
}

export { Tabs, TabsList, TabsTrigger, TabsContent }