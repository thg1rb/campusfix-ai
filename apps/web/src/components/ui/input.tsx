import * as React from "react";
import { cn } from "cn";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "campus-control-surface h-11 w-full min-w-0 py-1 file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground px-3 text-base outline-none transition-[color,background-color,border-color,box-shadow] duration-150 ease-out placeholder:text-muted-foreground disabled:cursor-not-allowed focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:enabled:border-destructive aria-invalid:inset-shadow-[0_0_0_1px_var(--destructive)] aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
