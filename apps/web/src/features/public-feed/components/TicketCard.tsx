import type { ReactNode } from "react"
import Image from "next/image"
import Link from "next/link"
import { ArrowUpRight, FileText, MapPin, Users } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { SeverityBadge, StatusBadge } from "@/components/shared/Badges"
import { formatThaiDateTime } from "@/lib/format"
import type { PrototypeState } from "@/data/seed"
import type { Ticket } from "@/types/domain"

const categoryTones: Record<string, string> = { "cat-elec": "warning", "cat-it": "indigo", "cat-bldg": "teal", "cat-clean": "success", "cat-sec": "violet" }

export function CategoryBadge({ categoryId, name }: { categoryId: string; name: string }) {
  return <Badge variant="secondary" data-tone={categoryTones[categoryId] ?? "neutral"} className="max-w-full whitespace-normal">{name}</Badge>
}

export const ticketGrid = "grid grid-cols-1 gap-3 min-[600px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 lg:gap-4 xl:grid-cols-5"

export function TicketCard({ ticket, state, eager = false, action, badges, horizontal = false }: {
  ticket: Ticket; state: PrototypeState; eager?: boolean; action?: { href: string; label: string; primary?: boolean }; badges?: ReactNode; horizontal?: boolean
}) {
  const reports = state.reports.filter(report => report.ticketId === ticket.id && report.status === "CONFIRMED")
  const thumbnail = reports[0]?.images[0]
  const category = state.categories.find(item => item.id === ticket.categoryId)
  const affected = state.affected.filter(item => item.ticketId === ticket.id).length
  return <Card className={cn(
    "group relative min-w-0 gap-0 overflow-hidden rounded-2xl border py-0 shadow-xs ring-0 transition-[translate,box-shadow,border-color] duration-200 hover:border-primary/40 hover:shadow-md focus-within:border-primary/50 motion-safe:hover:-translate-y-0.5",
    horizontal && "sm:grid sm:grid-cols-[minmax(10rem,1fr)_minmax(0,2fr)]",
  )}>
    <div className={cn("relative aspect-[16/10] overflow-hidden bg-muted", horizontal && "sm:aspect-auto sm:min-h-44")}>
      {thumbnail && <Image unoptimized src={thumbnail.url} alt={thumbnail.alt} loading={eager ? "eager" : "lazy"} fill sizes="(min-width: 1280px) 20vw, (min-width: 600px) 33vw, 100vw" className="object-cover transition-transform duration-300 ease-out motion-safe:group-hover:scale-[1.04]" />}
    </div>
    <div className="flex min-w-0 flex-1 flex-col">
    <CardHeader className="gap-2 px-3.5 pt-3.5">
      <CardDescription className="flex items-center justify-between gap-2 text-xs font-medium tabular-nums">{ticket.ticketNumber}{!action && <ArrowUpRight size={16} aria-hidden="true" className="text-primary" />}</CardDescription>
      <div className="flex flex-wrap items-center gap-1"><StatusBadge status={ticket.status} /><SeverityBadge level={ticket.severity} />{badges}</div>
      <CardTitle>
        {action ? <h2 className="text-base font-semibold [overflow-wrap:anywhere]">{ticket.title}</h2> : <Link href={`/tickets/${ticket.ticketNumber}`} className="flex min-h-11 items-center font-semibold leading-relaxed text-foreground transition-colors group-hover:text-primary focus-visible:text-primary after:absolute after:inset-0">
          <span className="line-clamp-2">{ticket.title}</span>
        </Link>}
      </CardTitle>
    </CardHeader>
    <CardContent className="mt-auto grid gap-2 px-3.5 pb-3.5 pt-2 text-sm text-muted-foreground">
      <p className="flex items-start gap-1.5"><MapPin size={15} className="mt-1 shrink-0" aria-hidden="true" />{ticket.location.locationName}</p>
      <div className="flex flex-wrap items-center gap-2"><CategoryBadge categoryId={ticket.categoryId} name={category?.name ?? "—"} /><span>{ticket.departments.length} หน่วยงาน</span></div>
      <p className="text-xs">{formatThaiDateTime(ticket.confirmedAt)}</p>
      <p className="flex flex-wrap gap-x-3 gap-y-1 border-t pt-2 text-xs">
        <span className="inline-flex items-center gap-1"><FileText size={14} aria-hidden="true" />{reports.length} รายงาน</span>
        <span className="inline-flex items-center gap-1"><Users size={14} aria-hidden="true" />{affected} ผู้ได้รับผลกระทบ</span>
      </p>
      {action && <Button asChild variant={action.primary ? "default" : "outline"} className="justify-self-start">
        <Link href={action.href}>{action.label}<ArrowUpRight aria-hidden="true" /></Link>
      </Button>}
    </CardContent>
    </div>
  </Card>
}
