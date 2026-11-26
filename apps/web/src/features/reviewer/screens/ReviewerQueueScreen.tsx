"use client"

import { useState } from "react"
import Link from "next/link"
import { ClipboardCheck, LockKeyhole } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CampusHeading } from "@/components/shared/CampusHeading"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { AccessNotice, Choice, labelOptions, PageFrame } from "@/components/shared/Controls"
import { EmptyState } from "@/components/shared/EmptyState"
import { severityLabels, SeverityBadge, ticketStatusLabels } from "@/components/shared/Badges"
import { PaginationBar } from "@/components/shared/PaginationBar"
import { allResults, matchesSearch, ResultFilters } from "@/components/shared/ResultFilters"
import { CategoryBadge, TicketCard } from "@/features/public-feed"
import { AnalysisBadge, ReportListCard } from "@/features/reports"
import { usePagination } from "@/hooks/usePagination"
import { canReviewOrManageTicket, canReviewReport, isActiveTicket, isExclusiveAdmin } from "@/lib/domain/permissions"
import { usePrototype } from "@/lib/store/PrototypeStore"
import type { TicketStatus } from "@/types/domain"

export default function ReviewerQueueScreen() {
  const { state, user } = usePrototype()
  const [tab, setTab] = useState("pending")
  const [query, setQuery] = useState("")
  const [ai, setAi] = useState("all")
  const [reviewability, setReviewability] = useState("all")
  const [status, setStatus] = useState("all")
  const [severity, setSeverity] = useState("all")
  const reportsPager = usePagination()
  const ticketsPager = usePagination()

  if (!state || !user?.roles.includes("REVIEWER") || isExclusiveAdmin(user)) return <AccessNotice loggedIn={!!user} path="/reviewer" />
  const pending = state.reports.filter(report => report.status === "PENDING_REVIEW")
  const active = state.tickets.filter(ticket => isActiveTicket(ticket.status))
  const people = new Map(state.users.map(item => [item.id, item.username]))
  const categories = new Map(state.categories.map(item => [item.id, item.name]))
  const runs = new Map(state.aiRuns.filter(run => !run.isOutdated).map(run => [run.reportId, run]))
  const usernameQuery = query.trim().replace(/^@/, "")
  const reporterMatches = new Set(usernameQuery ? state.reports.flatMap(report =>
    report.status === "CONFIRMED" && report.ticketId && matchesSearch(usernameQuery, people.get(report.reporterId)) ? [report.ticketId] : [],
  ) : [])
  const pendingMatches = pending.filter(report => {
    const reviewable = canReviewReport(user, report).allowed
    return (ai === "all" || (runs.get(report.id)?.status ?? "PENDING") === ai) &&
      (reviewability === "all" || (reviewability === "allowed") === reviewable) &&
      (matchesSearch(query, report.reportNumber, report.aiGeneratedTitle, report.description, report.location?.locationName) ||
        (!!usernameQuery && matchesSearch(usernameQuery, people.get(report.reporterId))))
  }).toSorted((a, b) => (b.submittedAt ?? "").localeCompare(a.submittedAt ?? ""))
  const ticketMatches = active.filter(ticket =>
    (status === "all" || ticket.status === status) && (severity === "all" || ticket.severity === severity) &&
    (reporterMatches.has(ticket.id) || matchesSearch(query, ticket.ticketNumber, ticket.title, ticket.summary, ticket.location.locationName)),
  ).toSorted((a, b) => b.confirmedAt.localeCompare(a.confirmedAt))
  const reportPage = reportsPager.current(pendingMatches)
  const ticketPage = ticketsPager.current(ticketMatches)
  const activeTab = tab === "tickets"
  const statuses = labelOptions(ticketStatusLabels).filter(item => isActiveTicket(item.value as TicketStatus))

  function clearFilters() {
    setQuery("")
    if (activeTab) { setStatus("all"); setSeverity("all") }
    else { setAi("all"); setReviewability("all") }
    reportsPager.reset()
    ticketsPager.reset()
  }

  return <PageFrame wide>
    <CampusHeading title="คิวตรวจสอบรายงาน" context="ศูนย์กลางการตรวจสอบ · มหาวิทยาลัยเกษตรศาสตร์" icon={ClipboardCheck} stats={[
      { label: "รอตรวจสอบ", value: pending.length },
      { label: "เรื่องที่เปิดอยู่", value: active.length },
      { label: "รายงานที่ตรวจสอบได้", value: pending.filter(report => canReviewReport(user, report).allowed).length },
    ]} />
    <ResultFilters label={activeTab ? "ค้นหาเรื่องที่เปิดอยู่" : "ค้นหารายงานในคิว"} placeholder="ค้นหาเลขรายการ หัวข้อ ผู้แจ้ง หรือสถานที่…"
      query={query} onQuery={value => { setQuery(value); reportsPager.reset(); ticketsPager.reset() }} onClear={clearFilters}>
      {activeTab ? <>
        <div className="w-full sm:w-48"><Choice label="สถานะเรื่อง" value={status} options={[allResults, ...statuses]}
          onChange={value => { setStatus(value); ticketsPager.reset() }} /></div>
        <div className="w-full sm:w-48"><Choice label="ระดับความรุนแรง" value={severity} options={[allResults, ...labelOptions(severityLabels)]}
          onChange={value => { setSeverity(value); ticketsPager.reset() }} /></div>
      </> : <>
        <div className="w-full sm:w-52"><Choice label="สถานะ AI" value={ai} options={[allResults,
          { value: "PENDING", label: "รอผลวิเคราะห์" }, { value: "COMPLETED", label: "วิเคราะห์แล้ว" }, { value: "FAILED", label: "วิเคราะห์ไม่สำเร็จ" }]}
          onChange={value => { setAi(value); reportsPager.reset() }} /></div>
        <div className="w-full sm:w-52"><Choice label="สิทธิ์ตรวจสอบ" value={reviewability} options={[allResults,
          { value: "allowed", label: "ตรวจสอบได้" }, { value: "blocked", label: "รายงานของคุณ" }]}
          onChange={value => { setReviewability(value); reportsPager.reset() }} /></div>
      </>}
    </ResultFilters>
    <Tabs value={tab} onValueChange={setTab} className="min-w-0">
      <TabsList aria-label="มุมมองคิวตรวจสอบ">
        <TabsTrigger value="pending" count={pendingMatches.length}>รอตรวจสอบ</TabsTrigger>
        <TabsTrigger value="tickets" count={ticketMatches.length}>เรื่องที่เปิดอยู่</TabsTrigger>
      </TabsList>
      <TabsContent value="pending" className="grid min-w-0 gap-4">
        {reportPage.items.length === 0 && <EmptyState title="ไม่พบรายงานรอตรวจสอบที่ตรงกับตัวกรอง" />}
        <ul className="grid gap-3">{reportPage.items.map(report => {
          const run = runs.get(report.id)
          const categoryId = run?.suggestedCategoryId
          const category = categoryId && categories.get(categoryId)
          const allowed = canReviewReport(user, report).allowed
          return <ReportListCard key={report.id} report={report} username={people.get(report.reporterId)} submitted badges={<>
            {!allowed && <Badge variant="outline" data-tone="neutral"><LockKeyhole aria-hidden="true" /> รายงานของคุณ</Badge>}
            <AnalysisBadge run={run} candidateNumber={state.tickets.find(ticket => ticket.id === run?.candidateTicketId)?.ticketNumber} />
            {run?.suggestedSeverity && <SeverityBadge level={run.suggestedSeverity} />}
            {categoryId && category && <CategoryBadge categoryId={categoryId} name={category} />}
          </>}>
            <Button asChild variant={allowed ? "default" : "outline"} className="mt-1 justify-self-start">
              <Link href={`/reviewer/reports/${report.reportNumber}`}>เปิดรายงาน {report.reportNumber}</Link>
            </Button>
          </ReportListCard>
        })}</ul>
        <PaginationBar {...reportPage.controls} />
      </TabsContent>
      <TabsContent value="tickets" className="grid min-w-0 gap-4">
        {ticketPage.items.length === 0 && <EmptyState title="ไม่พบเรื่องที่เปิดอยู่ที่ตรงกับตัวกรอง" />}
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{ticketPage.items.map(ticket => {
          const allowed = canReviewOrManageTicket(user, ticket, state.reports).allowed
          const aiReview = ticket.pendingReevaluation
          return <TicketCard key={ticket.id} ticket={ticket} state={state} badges={<>
            {!allowed && <Badge variant="outline" data-tone="neutral"><LockKeyhole aria-hidden="true" /> เรื่องที่คุณแจ้ง</Badge>}
            {aiReview && !aiReview.isReviewed && <Badge variant="outline" data-tone={aiReview.status === "FAILED" ? "warning" : "indigo"}>
              {aiReview.status === "FAILED" ? "AI จำลองวิเคราะห์ไม่สำเร็จ" : "รอทบทวนผล AI"}
            </Badge>}
          </>} action={{ href: `/reviewer/tickets/${ticket.ticketNumber}`, label: `จัดการ ${ticket.ticketNumber}` }} />
        })}</div>
        <PaginationBar {...ticketPage.controls} />
      </TabsContent>
    </Tabs>
  </PageFrame>
}
