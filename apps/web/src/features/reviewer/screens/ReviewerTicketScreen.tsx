"use client"

import Link from "next/link"
import { BackButton } from "@/components/shared/BackButton"
import { CampusHeading } from "@/components/shared/CampusHeading"
import { ClipboardCheck } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { AccessNotice, Choice, ErrorNotice, labelOptions, namedOptions, PageFrame } from "@/components/shared/Controls"
import { MultiChoice, TextField } from "@/components/shared/FormControls"
import { EmptyState } from "@/components/shared/EmptyState"
import { SeverityBadge, severityLabels, StatusBadge } from "@/components/shared/Badges"
import { SoDGuardBanner } from "@/components/shared/SoDGuardBanner"
import { CampusMapPicker } from "@/features/map"
import { DepartmentProgress, PrivateThread, TicketStatusActions } from "@/features/tickets"
import { canReviewOrManageTicket, isActiveTicket, isExclusiveAdmin } from "@/lib/domain/permissions"
import { usePrototype } from "@/lib/store/PrototypeStore"
import type { StoreAction } from "@/lib/store/mutations"
import type { Report, Severity, Ticket } from "@/types/domain"

function DepartmentManager({ ticket, disabled }: { ticket: Ticket; disabled: boolean }) {
  const { state, dispatch } = usePrototype()
  const [ids, setIds] = useState(ticket.departments.map(item => item.departmentId))
  const [warning, setWarning] = useState(false)
  const [error, setError] = useState("")
  const options = namedOptions(state?.departments.filter(item => item.isActive || ticket.departments.some(dept => dept.departmentId === item.id)) ?? [])
  async function save() {
    const result = await dispatch({ type: "departments", id: ticket.id, ids })
    if (result.ok) { setError(""); toast.success("อัปเดตหน่วยงานที่รับผิดชอบแล้ว") }
    else setError(result.message)
  }
  return <section className="grid gap-3 rounded-lg border bg-card p-4">
    <h2>จัดการหน่วยงาน</h2>
    <MultiChoice legend="หน่วยงานที่รับผิดชอบ" options={options} selected={ids} onChange={setIds} disabled={disabled} />
    {error && <ErrorNotice message={error} />}
    <Button className="justify-self-start" disabled={disabled} onClick={() => {
      if (ids.length && ids.every(id => ticket.departments.some(item => item.departmentId === id && item.isCompleted))) setWarning(true)
      else save()
    }}>บันทึกหน่วยงานที่รับผิดชอบ</Button>
    <AlertDialog open={warning} onOpenChange={setWarning}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>ระบบจะแก้ไขเสร็จสิ้นโดยอัตโนมัติ</AlertDialogTitle>
          <AlertDialogDescription>หน่วยงานที่เหลือทั้งหมดดำเนินการเสร็จแล้ว ระบบจะเปลี่ยนสถานะเป็นแก้ไขเสร็จแล้วทันที</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>กลับ</AlertDialogCancel><AlertDialogAction onClick={save}>ยืนยันการเปลี่ยนหน่วยงาน</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>
}

function CorrectReport({ report, disabled }: { report: Report; disabled: boolean }) {
  const { dispatch, state } = usePrototype()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(report.aiGeneratedTitle ?? "")
  const [description, setDescription] = useState(report.description)
  const [location, setLocation] = useState(report.location)
  const [error, setError] = useState("")
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button disabled={disabled} variant="outline">แก้ไข {report.reportNumber}</Button></DialogTrigger>
    <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle>แก้ไขรายงาน {report.reportNumber}</DialogTitle><DialogDescription>ระบบจะวิเคราะห์ข้อมูลของเรื่องอีกครั้งหลังบันทึก</DialogDescription></DialogHeader>
      <TextField label="ชื่อรายงาน" value={title} onChange={setTitle} required />
      <TextField label="รายละเอียดปัญหา" value={description} onChange={setDescription} multiline required />
      <CampusMapPicker locations={state?.locations ?? []} value={location} onChange={setLocation} />
      {error && <ErrorNotice message={error} />}
      <DialogFooter><Button onClick={async () => {
        const result = await dispatch({ type: "correctReport", id: report.id, title, fields: { description, location } })
        if (result.ok) { setOpen(false); setError(""); toast.success("บันทึกรายงานและวิเคราะห์เรื่องใหม่แล้ว") }
        else setError(result.message)
      }}>บันทึกรายงานที่แก้ไข</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}

function Reevaluation({ ticket, disabled }: { ticket: Ticket; disabled: boolean }) {
  const { state, dispatch } = usePrototype()
  const [manual, setManual] = useState(false)
  const [warning, setWarning] = useState<"apply" | "manual" | null>(null)
  const [title, setTitle] = useState(ticket.title)
  const [summary, setSummary] = useState(ticket.summary)
  const [severity, setSeverity] = useState(ticket.severity)
  const [departments, setDepartments] = useState(ticket.departments.map(item => item.departmentId))
  const [error, setError] = useState("")
  const run = ticket.pendingReevaluation
  if (!run || run.isReviewed) return null
  async function save(resolution: Extract<StoreAction, { type: "reevaluate" }>["resolution"], confirmed = false) {
    if (resolution === "manual" && !departments.length) { setError("กรุณาเลือกหน่วยงานอย่างน้อย 1 แห่ง"); return }
    const ids = resolution === "manual" ? departments : ticket.pendingReevaluation?.recommendedDepartmentIds
    if (!confirmed && resolution !== "keep" && ids?.length &&
      ids.every(id => ticket.departments.some(assignment => assignment.departmentId === id && assignment.isCompleted))) {
      setWarning(resolution)
      return
    }
    const result = await dispatch({ type: "reevaluate", id: ticket.id, resolution, title, summary, severity, departmentIds: departments })
    if (result.ok) toast.success("บันทึกผลทบทวนแล้ว")
    else setError(result.message)
  }
  const names = (ids: string[]) => ids.map(id => state?.departments.find(item => item.id === id)?.name ?? id).join(" · ")
  return <section className="grid gap-3 rounded-lg border bg-muted p-4">
    <h2>รอทบทวนผลวิเคราะห์ AI จำลอง</h2>
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="min-w-0 rounded-md border bg-card p-3 [overflow-wrap:anywhere]"><h3 className="font-semibold">ข้อมูลปัจจุบัน</h3>
        <p>{ticket.title}</p><p className="whitespace-pre-wrap">{ticket.summary}</p><SeverityBadge level={ticket.severity} /><p>{names(ticket.departments.map(item => item.departmentId))}</p>
      </div>
      <div className="min-w-0 rounded-md border bg-card p-3 [overflow-wrap:anywhere]"><h3 className="font-semibold">ข้อเสนอแนะใหม่</h3>
        {run.status === "FAILED" ? <p>{run.rationale}</p> : <><p>{run.suggestedTitle}</p><p className="whitespace-pre-wrap">{run.suggestedSummary}</p>
          {run.suggestedSeverity && <SeverityBadge level={run.suggestedSeverity} />}<p>{names(run.recommendedDepartmentIds)}</p></>}
      </div>
    </div>
    <div className="flex flex-wrap gap-2">
      <Button disabled={disabled || run.status !== "COMPLETED"} onClick={() => save("apply")}>นำข้อเสนอแนะไปใช้</Button>
      <Button disabled={disabled} onClick={() => setManual(!manual)} variant="outline">แก้ไขเอง</Button>
      <Button disabled={disabled} onClick={() => save("keep")} variant="outline">คงข้อมูลเดิมไว้</Button>
    </div>
    {manual && <div className="grid gap-3">
      <TextField label="ชื่อเรื่อง" value={title} onChange={setTitle} />
      <TextField label="สรุปเรื่อง" value={summary} onChange={setSummary} multiline />
      <Choice label="ระดับความรุนแรง" value={severity} options={labelOptions(severityLabels)} onChange={value => setSeverity(value as Severity)} />
      <MultiChoice legend="หน่วยงานที่รับผิดชอบสำหรับผลทบทวน" options={namedOptions(state?.departments.filter(item => item.isActive || departments.includes(item.id)) ?? [])} selected={departments} onChange={setDepartments} />
      <Button className="justify-self-start" disabled={disabled} onClick={() => save("manual")}>บันทึกข้อมูลที่ทบทวน</Button>
    </div>}
    {error && <ErrorNotice message={error} />}
    <AlertDialog open={warning !== null} onOpenChange={open => { if (!open) setWarning(null) }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>ระบบจะเปลี่ยนสถานะเป็นแก้ไขเสร็จแล้ว</AlertDialogTitle>
          <AlertDialogDescription>หน่วยงานที่เหลือทั้งหมดดำเนินการเสร็จแล้ว ระบบจะเปลี่ยนสถานะเป็นแก้ไขเสร็จแล้วทันที</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>กลับ</AlertDialogCancel><AlertDialogAction onClick={() => {
          if (warning) save(warning, true)
        }}>ยืนยันผลทบทวน</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>
}

export default function ReviewerTicketScreen({ ticketNumber }: { ticketNumber: string }) {
  const { state, user } = usePrototype()
  if (!state || !user?.roles.includes("REVIEWER") || isExclusiveAdmin(user)) return <AccessNotice loggedIn={!!user} path={`/reviewer/tickets/${ticketNumber}`} />
  const ticket = state.tickets.find(item => item.ticketNumber === ticketNumber)
  if (!ticket) return <PageFrame><BackButton href="/reviewer" label="กลับคิวตรวจสอบ" /><EmptyState title="ไม่พบเรื่องที่ระบุ" /></PageFrame>
  const guard = canReviewOrManageTicket(user, ticket, state.reports)
  const active = isActiveTicket(ticket.status)
  const disabled = !guard.allowed || !active
  const reports = state.reports.filter(item => item.ticketId === ticket.id && item.status === "CONFIRMED")
  return <PageFrame>
    <BackButton href="/reviewer" label="กลับคิวตรวจสอบ" breadcrumb={{ parent: "คิวตรวจสอบ", current: ticket.ticketNumber }} />
    <CampusHeading title={ticket.title} context="พื้นที่ตรวจสอบเรื่อง" icon={ClipboardCheck} subtitle={ticket.location.locationName}
      badges={<><span className="text-sm font-medium" translate="no">{ticket.ticketNumber}</span><StatusBadge status={ticket.status} /><SeverityBadge level={ticket.severity} /></>}>
      <Button asChild variant="outline"><Link href={`/tickets/${ticket.ticketNumber}`}>เปิดรายละเอียดสาธารณะ</Link></Button>
    </CampusHeading>
    {!guard.allowed && <SoDGuardBanner reason={guard.reason} />}
    {!active && <p className="rounded-md border bg-card p-3">เรื่องนี้สิ้นสุดแล้ว รายละเอียดการดำเนินงานแสดงในหน้าสาธารณะ</p>}
    <TicketStatusActions ticket={ticket} disabled={disabled} workspace="reviewer" />
    <Reevaluation key={ticket.pendingReevaluation?.id ?? ticket.id} ticket={ticket} disabled={disabled} />
    <div className="grid min-w-0 gap-4 md:grid-cols-2">
      <div className="grid min-w-0 content-start gap-4">
        <DepartmentProgress ticket={ticket} />
        {active && <DepartmentManager key={`${user.id}:${ticket.departments.map(item => item.departmentId).join(",")}`} ticket={ticket} disabled={disabled} />}
      </div>
      <div className="grid min-w-0 content-start gap-4">
        <section className="grid gap-2 rounded-lg border bg-card p-4">
          <h2>รายงานที่ยืนยันแล้ว</h2>
          {reports.map(report => <div key={report.id} className="grid gap-2 border-b pb-2 last:border-0">
            <p>{report.aiGeneratedTitle}</p><div><CorrectReport key={`${report.id}:${report.version}`} report={report} disabled={disabled} /></div>
          </div>)}
        </section>
        <PrivateThread key={user.id} ticket={ticket} />
      </div>
    </div>
  </PageFrame>
}
