"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Tabs as TabsPrimitive } from "radix-ui"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-horizontal:flex-col",
        className
      )}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex h-auto w-fit max-w-full flex-wrap items-center gap-1 p-1 group-data-vertical/tabs:flex-col",
  {
    variants: {
      variant: {
        default: "rounded-xl border border-border bg-muted/70 shadow-2xs",
        line: "bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  children,
  count,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger> & { count?: number }) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "group/tab inline-flex min-h-11 min-w-11 max-w-full flex-wrap items-center justify-center gap-1.5 rounded-lg border border-transparent px-3.5 py-2 text-sm font-medium text-muted-foreground [overflow-wrap:anywhere]",
        "transition-[color,background-color,border-color,box-shadow,scale] duration-150 ease-out enabled:hover:bg-card/70 enabled:hover:text-foreground enabled:active:scale-[0.98] motion-reduce:transition-none motion-reduce:enabled:active:scale-100",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-[var(--color-disabled-bg)] disabled:text-[var(--color-disabled-text)] group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
        "data-[state=active]:enabled:border-[var(--color-brand-border)] data-[state=active]:enabled:bg-card data-[state=active]:enabled:font-semibold data-[state=active]:enabled:text-primary data-[state=active]:enabled:shadow-xs",
        "group-data-[variant=line]/tabs-list:data-active:enabled:border-transparent group-data-[variant=line]/tabs-list:data-active:enabled:border-b-primary group-data-[variant=line]/tabs-list:data-active:enabled:shadow-none",
        className
      )}
      {...props}
    >{children}{count !== undefined && <span className="rounded-full bg-muted px-1.5 text-xs font-semibold tabular-nums text-muted-foreground group-data-active/tab:bg-[var(--color-brand-soft)] group-data-active/tab:text-primary">{count}</span>}</TabsPrimitive.Trigger>
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("min-w-0 flex-1 text-sm", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
