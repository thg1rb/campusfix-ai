import type { ReactNode } from "react"
import Image from "next/image"
import { Clock, ImageIcon, MapPin } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { ReportStatusBadge } from "@/components/shared/Badges"
import { formatThaiDateTime } from "@/lib/format"
import type { AIAnalysisRun, Report } from "@/types/domain"

export function AnalysisBadge({ run, candidateNumber }: { run?: AIAnalysisRun; candidateNumber?: string }) {
  if (!run || run.status === "PENDING") return <Badge variant="outline" data-tone="neutral">รอผลวิเคราะห์</Badge>
  if (run.status === "FAILED") return <Badge variant="outline" data-tone="warning">AI จำลองวิเคราะห์ไม่สำเร็จ</Badge>
  return <Badge variant="outline" data-tone="indigo" className="max-w-full whitespace-normal">
    AI {run.categoryConfidence !== null && `${run.categoryConfidence}% · `}{candidateNumber ?? (run.matchDecision === "MATCHED" ? "พบเรื่องที่คล้ายกัน" : "เสนอเปิดเรื่องใหม่")}
  </Badge>
}

export function ReportListCard({ report, username, submitted = false, badges, children }: {
  report: Report; username?: string; submitted?: boolean; badges?: ReactNode; children?: ReactNode
}) {
  const photo = report.images[0]
  const showVersion = report.status === "PENDING_REVIEW"
  return <li className="campus-panel campus-result grid min-w-0 gap-4 p-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:p-4 lg:grid-cols-[11rem_minmax(0,1fr)]">
    <div className="relative grid aspect-[16/9] w-full place-items-center overflow-hidden rounded-xl bg-muted text-muted-foreground sm:aspect-[4/3]">
      {photo
        ? <Image unoptimized src={photo.url} alt={photo.alt} fill sizes="(min-width: 1024px) 176px, (min-width: 640px) 144px, 100vw" className="object-cover" />
        : <ImageIcon size={26} aria-hidden="true" />}
    </div>
    <div className="grid min-w-0 content-start gap-2 [overflow-wrap:anywhere]">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">{report.reportNumber ?? "ฉบับร่าง"}{username && ` · @${username}`}</span>
        <ReportStatusBadge status={report.status} />
      </div>
      <h2 className="line-clamp-2 font-semibold">{reportListTitle(report, submitted)}</h2>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        {report.location && <span className="inline-flex items-start gap-1.5"><MapPin className="mt-1 shrink-0" size={15} aria-hidden="true" />{report.location.locationName}</span>}
        <span className="inline-flex items-start gap-1.5"><Clock className="mt-1 shrink-0" size={15} aria-hidden="true" />
          <span>{submitted ? "ส่งเมื่อ" : "อัปเดต"} {formatThaiDateTime(submitted ? report.submittedAt : report.updatedAt)}{showVersion && ` · เวอร์ชัน ${report.version}`}</span>
        </span>
      </div>
      {badges && <div className="flex min-w-0 flex-wrap gap-2">{badges}</div>}
      {children}
    </div>
  </li>
}

export function reportListTitle(report: Report, reviewer = false) {
  return ((reviewer || report.status === "CONFIRMED") && report.aiGeneratedTitle) ||
    report.description || "รายงานยังไม่มีรายละเอียด"
}
