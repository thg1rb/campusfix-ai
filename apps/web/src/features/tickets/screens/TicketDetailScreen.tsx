"use client"

import { BackButton } from "@/components/shared/BackButton"
import { CampusHeading } from "@/components/shared/CampusHeading"
import { useState } from "react"
import Link from "next/link"
import { publicFeedPath } from "@/features/auth"
import { FileText, MapPin, Plus, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SeverityBadge, StatusBadge } from "@/components/shared/Badges"
import { loginLink, PageFrame } from "@/components/shared/Controls"
import { EmptyState } from "@/components/shared/EmptyState"
import { CampusMap } from "@/features/map"
import { ReportPreview } from "@/features/reports"
import { canOperateAsDepartmentOnTicket, canReviewOrManageTicket, isActiveTicket, isExclusiveAdmin } from "@/lib/domain/permissions"
import { formatDuration, formatThaiDateTime } from "@/lib/format"
import { usePrototype } from "@/lib/store/PrototypeStore"
import { DepartmentProgress, FeedbackPanel, PublicActivityTimeline } from "../components/TicketPanels"
import { PrivateThread } from "../components/PrivateThread"

import { TicketLifecycle } from "../components/TicketLifecycle"
import { AffectedToggleButton } from "../components/AffectedToggleButton"

export default function TicketDetailScreen({ ticketNumber }: { ticketNumber: string }) {
  const { state, user } = usePrototype()
  const [now] = useState(Date.now)
  const ticket = state?.tickets.find(item => item.ticketNumber === ticketNumber)
  if (!state || !ticket) return <PageFrame><BackButton href={publicFeedPath} label="กลับรายการปัญหา" /><EmptyState title="ไม่พบเรื่องที่ระบุ" /></PageFrame>
  const reports = state.reports.filter(item => item.ticketId === ticket.id && item.status === "CONFIRMED")
  const affected = state.affected.filter(item => item.ticketId === ticket.id)
  const marked = affected.some(item => item.userId === user?.id)
  const active = isActiveTicket(ticket.status)
  const admin = isExclusiveAdmin(user)
  const addReport = `/reports/new?targetTicketNumber=${ticket.ticketNumber}`
  const category = state.categories.find(item => item.id === ticket.categoryId)
  return <PageFrame>
    <BackButton href={publicFeedPath} label="กลับรายการปัญหา" breadcrumb={{ parent: "รายการปัญหา", current: ticket.ticketNumber }} />
    <CampusHeading title={ticket.title} context={category?.name}
      badges={<><span className="text-sm font-medium" translate="no">{ticket.ticketNumber}</span><StatusBadge status={ticket.status} /><SeverityBadge level={ticket.severity} /></>}
      meta={<>ยืนยันเมื่อ {formatThaiDateTime(ticket.confirmedAt)}{active && ` · เปิดมาแล้ว ${formatDuration(now - Date.parse(ticket.confirmedAt))}`}</>}
      announceStats stats={[
        { label: "รายงาน", value: reports.length, icon: FileText },
        { label: "ผู้ได้รับผลกระทบ", value: affected.length, icon: Users },
      ]}>
      {!admin && <>
        <AffectedToggleButton active={active} marked={marked} count={affected.length} ticketId={ticket.id} ticketNumber={ticket.ticketNumber} />
        {active && <Button asChild variant="outline"><Link href={user ? addReport : loginLink(addReport)}><Plus aria-hidden="true" /> รายงานปัญหานี้เพิ่มเติม</Link></Button>}
        {active && canReviewOrManageTicket(user, ticket, state.reports).allowed && <Button asChild variant="outline"><Link href={`/reviewer/tickets/${ticket.ticketNumber}`}>จัดการเรื่อง</Link></Button>}
        {canOperateAsDepartmentOnTicket(user, ticket, state.reports).allowed && <Button asChild variant="outline"><Link href={`/department/tickets/${ticket.ticketNumber}`}>ดำเนินการเรื่องนี้</Link></Button>}
      </>}
    </CampusHeading>
    <TicketLifecycle status={ticket.status} />
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="grid min-w-0 content-start gap-4">
        <section className="campus-panel grid gap-3 p-4 sm:p-6">
          <h2>รายละเอียดปัญหา</h2><p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{ticket.summary}</p>
          <h3 className="flex gap-2 font-semibold"><MapPin size={19} aria-hidden="true" />{ticket.location.locationName}</h3>
          <CampusMap point={ticket.location} />
        </section>
        <section className="grid gap-3"><h2>รายงานที่ยืนยันแล้ว ({reports.length})</h2>
          {reports.map(report => <ReportPreview key={report.id} report={report} username={state.users.find(item => item.id === report.reporterId)?.username} />)}
        </section>
      </div>
      <div className="grid min-w-0 content-start gap-4"><DepartmentProgress ticket={ticket} /><PublicActivityTimeline ticket={ticket} /><FeedbackPanel ticket={ticket} /><PrivateThread key={user?.id} ticket={ticket} /></div>
    </div>
  </PageFrame>
}
