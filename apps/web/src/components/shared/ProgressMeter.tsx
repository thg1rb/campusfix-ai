import { cn } from "@/lib/utils"

export function ProgressMeter({ value, max, label, className }: { value: number; max: number; label?: string; className?: string }) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0
  return <div role={label ? "progressbar" : undefined} aria-label={label} aria-valuemin={label ? 0 : undefined}
    aria-valuemax={label ? max : undefined} aria-valuenow={label ? value : undefined} aria-hidden={label ? undefined : true}
    className="h-2.5 w-full min-w-0 overflow-hidden rounded-full bg-muted">
    <div className={cn("campus-meter h-full w-full origin-left rounded-full bg-primary", className)} style={{ transform: `scaleX(${ratio})` }} />
  </div>
}
