import Link from "next/link"
import { ArrowLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"

export function BackButton({ href, label, breadcrumb }: {
  href: string
  label: string
  breadcrumb?: { parent: string; current: string }
}) {
  return (
    <nav aria-label={breadcrumb ? "เส้นทางและการย้อนกลับ" : "ย้อนกลับ"} className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
      <Button asChild variant="outline" className="group/back min-h-11">
        <Link href={href}>
          <ArrowLeft aria-hidden="true" className="transition-transform duration-150 motion-safe:group-hover/back:-translate-x-0.5" />
          {label}
        </Link>
      </Button>
      {breadcrumb && <ol className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground">
        <li>{breadcrumb.parent}</li>
        <li aria-current="page" className="flex min-w-0 items-start gap-1.5 font-semibold text-foreground [overflow-wrap:anywhere]">
          <ChevronRight size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0">{breadcrumb.current}</span>
        </li>
      </ol>}
    </nav>
  )
}
