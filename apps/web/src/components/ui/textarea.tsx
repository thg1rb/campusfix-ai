import * as React from "react"
import { cn } from "cn"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "campus-control-surface flex field-sizing-content min-h-16 w-full min-w-0 py-2 px-3 text-base outline-none transition-[color,background-color,border-color,box-shadow] duration-150 ease-out placeholder:text-muted-foreground disabled:cursor-not-allowed focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:enabled:border-destructive aria-invalid:inset-shadow-[0_0_0_1px_var(--destructive)] aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
