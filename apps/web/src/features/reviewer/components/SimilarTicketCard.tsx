import Image from "next/image";
import Link from "next/link";
import { CheckCircle2, ExternalLink, ImageIcon, MapPin } from "lucide-react";
import { SeverityBadge, StatusBadge } from "@/components/shared/Badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ReportImage, Ticket } from "@/types/domain";

export function SimilarTicketCard({
  ticket,
  ranking,
  photo,
  category,
  reportCount,
  selected,
  disabled,
  onSelect,
}: {
  ticket: Ticket;
  ranking?: { rank: number; similarity: number };
  photo?: ReportImage;
  category: string;
  reportCount: number;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const score = Math.round(ranking?.similarity ?? 0);
  const tone = score >= 70 ? "success" : score >= 40 ? "warning" : "neutral";

  return (
    <li
      data-selected={selected}
      className="campus-panel grid min-w-0 gap-2 p-3 data-[selected=true]:border-primary! data-[selected=true]:bg-[var(--color-brand-soft)]! data-[selected=true]:ring-2! data-[selected=true]:ring-primary"
    >
      {ranking && (
        <Badge
          variant="outline"
          data-tone={tone}
          className="max-w-full justify-self-start whitespace-normal tabular-nums"
        >
          อันดับ {ranking.rank} · ความแม่นยำ {score}%
        </Badge>
      )}
      <Link
        href={`/tickets/${ticket.ticketNumber}`}
        target="_blank"
        rel="noopener noreferrer"
        className="grid min-h-11 min-w-0 gap-3 rounded-lg p-2 text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring sm:grid-cols-[5rem_minmax(0,1fr)]"
      >
        <div className="relative grid aspect-video w-full place-items-center overflow-hidden rounded-lg bg-muted text-muted-foreground sm:aspect-square">
          {photo ? (
            <Image
              unoptimized
              src={photo.url}
              alt={photo.alt}
              fill
              sizes="(min-width: 640px) 80px, 100vw"
              className="object-cover"
            />
          ) : (
            <ImageIcon size={20} aria-hidden="true" />
          )}
        </div>
        <div className="grid min-w-0 gap-2 [overflow-wrap:anywhere]">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium text-muted-foreground" translate="no">
              {ticket.ticketNumber}
            </span>
            <StatusBadge status={ticket.status} />
            <SeverityBadge level={ticket.severity} />
          </div>
          <h4 className="font-semibold">{ticket.title}</h4>
          <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
            <MapPin size={15} className="mt-1 shrink-0" aria-hidden="true" />
            {ticket.location.locationName}
          </p>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline" data-tone="neutral" className="max-w-full whitespace-normal">
              {category}
            </Badge>
            <span>{reportCount} รายงาน</span>
          </div>
          <span className="flex items-center gap-1.5 text-sm font-medium text-primary">
            ดูรายละเอียดเรื่อง <ExternalLink size={15} className="shrink-0" aria-hidden="true" />
            <span className="sr-only">เปิดในแท็บใหม่</span>
          </span>
        </div>
      </Link>
      <Button
        type="button"
        variant={selected ? "default" : "outline"}
        className="min-h-11 justify-self-start transition-[scale]"
        aria-pressed={selected}
        disabled={disabled}
        onClick={onSelect}
      >
        <CheckCircle2 aria-hidden="true" />
        {selected ? "เลือกแล้ว" : "เลือกเรื่องนี้"}
        <span className="sr-only"> {ticket.ticketNumber}</span>
      </Button>
    </li>
  );
}
