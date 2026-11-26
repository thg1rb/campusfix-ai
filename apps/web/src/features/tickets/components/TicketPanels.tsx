"use client"

import { useState } from "react"
import { BadgeCheck, Building2, CheckCheck, CheckCircle2, ClipboardCheck, Clock, FilePlus2, MessageSquareWarning, RefreshCw, Star, Wrench } from "lucide-react"
import { toast } from "sonner"
import { ActionLabel, useActionFeedback } from "@/components/shared/ActionFeedback"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { ProgressMeter } from "@/components/shared/ProgressMeter"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { ErrorNotice } from "@/components/shared/Controls"
import { EvidenceGallery } from "@/features/reports"
import { aggregateFeedback, feedbackDimensions, feedbackKeys } from "@/lib/domain/analytics"
import { canSubmitOrEditFeedback } from "@/lib/domain/permissions"
import { formatThaiDateTime } from "@/lib/format"
import { usePrototype } from "@/lib/store/PrototypeStore"
import type { FeedbackSubmission, PublicActivityEvent, Ticket } from "@/types/domain"

export function DepartmentProgress({ ticket }: { ticket: Ticket }) {
  const { state } = usePrototype()
  const total = ticket.departments.length
  const count = ticket.departments.filter(item => item.isCompleted).length
  return <section className="campus-panel grid gap-3 p-4 sm:p-6">
    <h2 className="flex items-center gap-2 font-semibold"><Building2 size={20} className="shrink-0 text-primary" aria-hidden="true" /> หน่วยงานที่รับผิดชอบ</h2>
    <p className="text-sm text-muted-foreground" aria-live="polite">เสร็จแล้ว <strong className="font-semibold tabular-nums text-primary">{count} / {total}</strong> หน่วยงาน</p>
    <ProgressMeter label="หน่วยงานที่ดำเนินการเสร็จแล้ว" value={count} max={total} />
    <ul className="grid gap-2">{ticket.departments.map(item => {
      const Icon = item.isCompleted ? CheckCircle2 : Clock
      return <li key={item.departmentId} data-tone={item.isCompleted ? "success" : "warning"} className="flex items-start gap-3 rounded-xl border p-3">
        <Icon size={19} className="mt-1 shrink-0" aria-hidden="true" />
        <div className="min-w-0"><strong className="text-sm">{state?.departments.find(dept => dept.id === item.departmentId)?.name ?? item.departmentId}</strong>
          <p className="text-xs">{item.isCompleted ? `เสร็จสิ้นแล้ว · ${formatThaiDateTime(item.completedAt)}` : "รอดำเนินการให้เสร็จสิ้น"}</p>
        </div>
      </li>
    })}</ul>
  </section>
}

const eventStyles = {
  TICKET_CONFIRMED: { Icon: CheckCircle2, tone: "info" },
  REPORT_ATTACHED: { Icon: FilePlus2, tone: "indigo" },
  DEPARTMENT_ADDED: { Icon: Building2, tone: "violet" },
  DEPARTMENT_REMOVED: { Icon: Building2, tone: "neutral" },
  DEPARTMENT_ACTION: { Icon: ClipboardCheck, tone: "teal" },
  DEPARTMENT_COMPLETED: { Icon: CheckCheck, tone: "success" },
  AUTO_RESOLVED: { Icon: BadgeCheck, tone: "success" },
}

function activityStyle(event: PublicActivityEvent) {
  if (event.type !== "STATUS_CHANGED") return eventStyles[event.type]
  if (event.newStatus === "WAITING_INFORMATION") return { Icon: MessageSquareWarning, tone: "waiting" }
  if (event.newStatus === "IN_PROGRESS") return { Icon: Wrench, tone: "warning" }
  return { Icon: RefreshCw, tone: "info" }
}

export function PublicActivityTimeline({ ticket }: { ticket: Ticket }) {
  const { state } = usePrototype()
  const events = state?.publicActivities.filter(item => item.ticketId === ticket.id) ?? []
  const ordered = events.toSorted((a, b) => a.createdAt.localeCompare(b.createdAt))
  return <section className="campus-panel grid gap-4 p-4 sm:p-6">
    <h2 className="font-semibold">ไทม์ไลน์การดำเนินงาน (สาธารณะ)</h2>
    <ol className="grid gap-3">{ordered.map(item => {
      const { Icon, tone } = activityStyle(item)
      const actor = state?.departments.find(dept => dept.id === item.departmentId)?.name ??
        (item.actorRole === "SYSTEM" ? "ระบบ" : item.actorRole === "DEPARTMENT_STAFF" ? "เจ้าหน้าที่หน่วยงาน" : "ผู้ตรวจสอบ")
      const resolved = item.type === "AUTO_RESOLVED"
      const outcome = resolved || item.newStatus === "RESOLVED" ? "success" : undefined
      return <li key={item.id} className="campus-enter group relative grid min-w-0 grid-cols-[2rem_minmax(0,1fr)] items-start gap-2 sm:grid-cols-[2.5rem_minmax(0,1fr)] sm:gap-3">
        <span className="absolute left-[15px] top-8 h-full border-l-2 border-border sm:left-[19px] sm:top-10 group-last:hidden" aria-hidden="true" />
        <span data-tone={tone} className={cn("relative grid size-8 place-items-center rounded-full border sm:size-10",
          resolved && "!bg-[var(--color-success)] !text-white")}><Icon size={18} aria-hidden="true" /></span>
        <div data-tone={outcome} className="grid min-w-0 gap-2 rounded-xl border bg-background p-3 sm:p-4">
          <p className="whitespace-pre-wrap text-sm font-medium [overflow-wrap:anywhere]">{item.summary}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" data-tone={tone} className="h-auto max-w-full whitespace-normal">{actor}</Badge>
            <time dateTime={item.createdAt} className="text-xs text-muted-foreground">{formatThaiDateTime(item.createdAt)}</time>
          </div>
          {item.evidenceImages.length > 0 && <EvidenceGallery images={item.evidenceImages} />}
        </div>
      </li>
    })}</ol>
    {ticket.resolutionSummary && <p className="whitespace-pre-wrap border-t pt-3 text-sm">{ticket.resolutionSummary}</p>}
  </section>
}

function FeedbackForm({ ticket, previous }: { ticket: Ticket; previous?: FeedbackSubmission }) {
  const { dispatch } = usePrototype()
  const action = useActionFeedback()
  const [preview, setPreview] = useState<{ key: keyof FeedbackSubmission["ratings"]; score: number } | null>(null)
  const [ratings, setRatings] = useState<Partial<FeedbackSubmission["ratings"]>>(previous?.ratings ?? {})
  const [comment, setComment] = useState(previous?.comment ?? "")
  const [error, setError] = useState("")
  return <form className="grid gap-4 border-t pt-4" onSubmit={event => {
    event.preventDefault()
    void action.run(() => dispatch({ type: "feedback", id: ticket.id, ratings: ratings as FeedbackSubmission["ratings"], comment }), result => {
      if (result.ok) { setError(""); toast.success("บันทึกคะแนนประเมินแล้ว") }
      else setError(result.message)
    })
  }}>
    <h3 className="font-semibold">{previous ? "แก้ไขคะแนนประเมิน" : "ประเมินผลการแก้ไข"}</h3>
    {feedbackKeys.map(key => <fieldset className="grid gap-2" key={key}>
      <legend className="text-sm font-medium">{feedbackDimensions[key]}</legend>
      <RadioGroup onPointerLeave={() => setPreview(null)} aria-label={feedbackDimensions[key]} className="flex flex-wrap gap-1" value={String(ratings[key] ?? "")}
        onValueChange={value => setRatings({ ...ratings, [key]: Number(value) })}>
        {([1, 2, 3, 4, 5] as const).map(score => <Label key={score} onPointerEnter={event => { if (event.pointerType === "mouse") setPreview({ key, score }) }} className={cn("relative grid size-11 place-items-center rounded-lg border border-input transition-colors hover:bg-amber-50", ratings[key] === score && "bg-amber-100")} htmlFor={`${key}-${score}`}>
          <RadioGroupItem id={`${key}-${score}`} value={String(score)} className="absolute inset-0 size-full opacity-0" aria-label={`${score} ดาว`} />
          <Star key={ratings[key] === score ? "selected" : "unselected"} size={19} fill={(preview?.key === key ? preview.score : ratings[key] ?? 0) >= score ? "currentColor" : "none"} className={cn("pointer-events-none text-[var(--color-warning)]", ratings[key] === score && "campus-pop scale-110")} aria-hidden="true" />
          <span className="sr-only">{score} ดาว</span>
        </Label>)}
      </RadioGroup>
    </fieldset>)}
    <Label htmlFor="feedback-comment">ความคิดเห็นเพิ่มเติม (ถ้ามี)</Label>
    <Textarea id="feedback-comment" value={comment} onChange={event => setComment(event.target.value)} />
    {error && <ErrorNotice message={error} />}
    <Button type="submit" className="justify-self-start" disabled={action.pending}><ActionLabel pending={action.pending}>บันทึกคะแนนประเมิน</ActionLabel></Button>
  </form>
}

export function FeedbackPanel({ ticket }: { ticket: Ticket }) {
  const { state, user } = usePrototype()
  if (!state || ticket.status !== "RESOLVED") return null
  const items = state.feedbacks.filter(item => item.ticketId === ticket.id)
  const summary = aggregateFeedback(items)
  return <section className="campus-panel grid gap-3 p-4 sm:p-6">
    <h2>ผลการประเมินการแก้ไข</h2>
    <p aria-live="polite"><strong>{summary.average?.toFixed(1) ?? "—"} / 5.0</strong> จาก {summary.count} ผู้ประเมิน</p>
    {summary.count > 0 && <dl className="grid gap-3">{summary.dimensions.map(({ key, average }) => <div key={key} className="grid gap-1">
      <dt className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
        {feedbackDimensions[key]} <span className="font-medium tabular-nums">{average?.toFixed(1)}</span>
      </dt>
      <dd className="w-full min-w-0"><ProgressMeter max={5} value={average ?? 0} label={feedbackDimensions[key]} /></dd>
    </div>)}</dl>}
    {canSubmitOrEditFeedback(user, ticket, state.reports).allowed && <FeedbackForm key={user?.id} ticket={ticket} previous={items.find(item => item.reporterId === user?.id)} />}
  </section>
}
