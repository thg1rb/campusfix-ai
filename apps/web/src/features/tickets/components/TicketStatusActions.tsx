"use client"

import { useState } from "react"
import { toast } from "sonner"
import { ActionLabel, useActionFeedback } from "@/components/shared/ActionFeedback"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { ErrorNotice } from "@/components/shared/Controls"
import { TextField } from "@/components/shared/FormControls"
import { usePrototype } from "@/lib/store/PrototypeStore"
import type { Ticket } from "@/types/domain"

function StatusDialog({ label, field, disabled, onSave }: { label: string; field: string; disabled: boolean; onSave: (reason: string) => Promise<string | undefined> }) {
  const action = useActionFeedback()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const [error, setError] = useState("")
  return <Dialog open={open} onOpenChange={value => { setOpen(value); if (!value) { setText(""); setError("") } }}>
    <DialogTrigger asChild><Button variant="outline" disabled={disabled}>{label}</Button></DialogTrigger>
    <DialogContent>
      <DialogHeader><DialogTitle>{label}</DialogTitle><DialogDescription>กรอกข้อมูลเพื่อยืนยันการเปลี่ยนสถานะ</DialogDescription></DialogHeader>
      <TextField label={field} value={text} onChange={setText} multiline required />
      {error && <ErrorNotice message={error} />}
      <DialogFooter><Button disabled={action.pending} onClick={() => {
        void action.run(() => onSave(text), message => {
          if (message) setError(message)
          else setOpen(false)
        })
      }}><ActionLabel pending={action.pending}>ยืนยัน</ActionLabel></Button></DialogFooter>
    </DialogContent>
  </Dialog>
}

export function TicketStatusActions({ ticket, disabled, workspace }: { ticket: Ticket; disabled: boolean; workspace: "reviewer" | "department" }) {
  const { dispatch } = usePrototype()
  const action = useActionFeedback()
  const [error, setError] = useState("")
  const canStart = workspace === "department" && (ticket.status === "CONFIRMED" || ticket.status === "WAITING_INFORMATION")
  const canAsk = ticket.status === "CONFIRMED" || ticket.status === "IN_PROGRESS"
  async function change(status: "IN_PROGRESS" | "WAITING_INFORMATION", reason?: string) {
    const result = await dispatch({ type: "status", id: ticket.id, status, reason, workspace })
    if (!result.ok) return result.message
    if (status === "WAITING_INFORMATION") toast.success("อัปเดตสถานะและบันทึกอีเมลจำลองแล้ว")
  }
  if (!canStart && !canAsk) return null
  return <div className="grid gap-2">
    <div className="flex flex-wrap gap-2">
      {canStart && <Button disabled={disabled || action.pending} onClick={() => {
        void action.run(() => change("IN_PROGRESS"), message => {
          setError(message ?? "")
          if (!message) toast.success("อัปเดตสถานะแล้ว")
        }, true)
      }}><ActionLabel pending={action.pending}>{ticket.status === "CONFIRMED" ? "เริ่มดำเนินการ" : "กลับมาดำเนินการต่อ"}</ActionLabel></Button>}
      {canAsk && <StatusDialog label="ขอข้อมูลเพิ่มเติม" field="คำถามถึงผู้แจ้ง (ส่วนตัว)" disabled={disabled} onSave={reason => change("WAITING_INFORMATION", reason)} />}
    </div>
    {error && <ErrorNotice message={error} />}
  </div>
}
