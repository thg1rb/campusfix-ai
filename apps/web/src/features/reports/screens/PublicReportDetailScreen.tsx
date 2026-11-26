"use client"

import Link from "next/link"
import { FileText, MapPin } from "lucide-react"
import { BackButton } from "@/components/shared/BackButton"
import { CampusHeading } from "@/components/shared/CampusHeading"
import { Button } from "@/components/ui/button"
import { publicFeedPath } from "@/features/auth"
import { EmptyState } from "@/components/shared/EmptyState"
import { PageFrame } from "@/components/shared/Controls"
import { ReportStatusBadge } from "@/components/shared/Badges"
import { CampusMap } from "@/features/map"
import { canReadReport } from "@/lib/domain/permissions"
import { formatThaiDateTime } from "@/lib/format"
import { usePrototype } from "@/lib/store/PrototypeStore"
import { EvidenceGallery } from "../components/EvidenceGallery"

export default function PublicReportDetailScreen({ reportNumber }: { reportNumber: string }) {
  const { state, user } = usePrototype()
  const report = state?.reports.find(item => item.reportNumber === reportNumber)
  if (!report || !state || !canReadReport(user, report)) return <PageFrame><BackButton href={publicFeedPath} label="กลับรายการปัญหา" /><EmptyState title="ไม่พบรายงานสาธารณะนี้" /></PageFrame>
  const ticket = state.tickets.find(item => item.id === report.ticketId)
  const owner = state.users.find(item => item.id === report.reporterId)
  return <PageFrame>
    {ticket
      ? <BackButton href={`/tickets/${ticket.ticketNumber}`} label="กลับรายละเอียดเรื่อง" breadcrumb={{ parent: ticket.ticketNumber, current: reportNumber }} />
      : <BackButton href="/my-reports" label="กลับรายงานของฉัน" breadcrumb={{ parent: "รายงานของฉัน", current: reportNumber }} />}
    <CampusHeading icon={FileText} context="รายละเอียดรายงาน"
      title={(report.status === "CONFIRMED" && report.aiGeneratedTitle) || "รายละเอียดรายงาน"}
      badges={<><span className="text-sm font-medium" translate="no">{report.reportNumber}</span><ReportStatusBadge status={report.status} /></>}
      meta={<>ส่งเมื่อ {formatThaiDateTime(report.submittedAt)}{report.status === "CONFIRMED" && ` · ยืนยันเมื่อ ${formatThaiDateTime(report.reviewedAt)}`}</>}>
      {owner && <Button asChild variant="outline"><Link href={`/u/${encodeURIComponent(owner.username)}`} translate="no">@{owner.username}</Link></Button>}
    </CampusHeading>
    <div className="grid min-w-0 gap-5 md:grid-cols-2">
      <section className="grid min-w-0 content-start gap-3 rounded-lg border bg-card p-4">
        <h2>รายละเอียดปัญหา</h2><p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{report.description}</p>
        <EvidenceGallery images={report.images} />
      </section>
      {report.location && <section className="grid content-start gap-3 rounded-lg border bg-card p-4"><h2>สถานที่เกิดเหตุ</h2>
        <p className="flex gap-2"><MapPin size={18} className="shrink-0" aria-hidden="true" />{report.location.locationName} {report.location.detailNote}</p>
        <CampusMap point={report.location} />
      </section>}
    </div>
  </PageFrame>
}
