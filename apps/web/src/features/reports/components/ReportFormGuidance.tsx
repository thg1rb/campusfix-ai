import { AlertTriangle, CheckCircle2, Circle, ClipboardCheck, Sparkles, Wrench, type LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { reportErrors, type ReportFields } from "@/lib/domain/validation"

export const reportCampus = "มหาวิทยาลัยเกษตรศาสตร์ · วิทยาเขตบางเขน"
export const reportRoutingHint = "ทีมผู้ตรวจสอบส่วนกลางจะตรวจสอบรายงานและส่งเรื่องให้หน่วยงานที่รับผิดชอบ"

export function ReportStep({ number, icon: Icon, title, hint, children }: {
  number: 1 | 2 | 3; icon: LucideIcon; title: string; hint: string; children: ReactNode
}) {
  return <section aria-labelledby={`report-step-${number}`} className="grid min-w-0 gap-4">
    <div className="flex items-start gap-3">
      <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-sm font-semibold tabular-nums text-primary-foreground">{number}</span>
      <div className="min-w-0">
        <h2 id={`report-step-${number}`} className="flex items-start gap-2 text-base font-semibold leading-relaxed">
          <span className="sr-only">ขั้นตอนที่ {number} · </span><Icon size={18} className="mt-1 shrink-0 text-primary" aria-hidden="true" />{title}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
      </div>
    </div>
    {children}
  </section>
}

const guide = [
  { icon: Sparkles, title: "AI วิเคราะห์รายงาน", text: "ใช้รายละเอียด รูปภาพ และหมุดเพื่อเสนอประเภทปัญหา ความรุนแรง และหน่วยงาน" },
  { icon: ClipboardCheck, title: "ผู้ตรวจสอบจัดกลุ่มเรื่อง", text: "ตรวจสอบข้อมูลและยืนยันว่าจะรวมกับเรื่องเดิมหรือเปิดเรื่องใหม่" },
  { icon: Wrench, title: "หน่วยงานดำเนินการ", text: "หน่วยงานที่รับผิดชอบแก้ไขปัญหา ระบบส่งอีเมลแจ้งผู้รายงานเมื่อมีเหตุการณ์สำคัญ" },
]

export function ReportFormGuidance({ fields }: { fields: ReportFields }) {
  const errors = reportErrors(fields)
  const checklist = [
    { label: "รายละเอียดปัญหา", ready: !errors.description },
    { label: "รูปภาพอย่างน้อย 1 ภาพ", ready: !errors.images, count: fields.images.length },
    { label: "ตำแหน่งและพิกัดบนแผนที่", ready: !errors.location },
  ]
  const ready = checklist.filter(item => item.ready).length

  return <aside aria-label="คำแนะนำการส่งรายงาน" className="grid min-w-0 gap-4 lg:sticky lg:top-24">
    <section className="campus-panel grid gap-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-base font-semibold">เช็กลิสต์ความพร้อมก่อนส่ง</h2>
        <Badge variant="outline" data-tone={ready === checklist.length ? "success" : "neutral"} className="tabular-nums">
          ครบ {ready} / {checklist.length} ขั้นตอน
        </Badge>
      </div>
      <ul aria-live="polite" aria-atomic="true" className="grid gap-2">
        {checklist.map(item => {
          const Marker = item.ready ? CheckCircle2 : Circle
          return <li key={item.label} data-tone={item.ready ? "success" : "neutral"}
            className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-3 py-2 text-sm transition-colors">
            <Marker size={17} className="shrink-0" aria-hidden="true" />
            <span>{item.label}</span>
            <span className="sr-only">{item.ready ? "ครบแล้ว" : "ยังไม่ครบ"}</span>
            {item.count !== undefined && <span className="ms-auto shrink-0 font-medium tabular-nums">{item.count}/5</span>}
          </li>
        })}
      </ul>
    </section>
    <section className="campus-panel grid gap-3 p-4 sm:p-5">
      <h2 className="text-base font-semibold">ขั้นตอนหลังส่งรายงาน</h2>
      <ol className="grid gap-3">{guide.map(({ icon: Icon, title, text }) => <li key={title} className="flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--color-brand-soft)] text-primary"><Icon size={16} aria-hidden="true" /></span>
        <div className="min-w-0"><p className="text-sm font-medium">{title}</p><p className="text-sm text-muted-foreground">{text}</p></div>
      </li>)}</ol>
    </section>
    <Alert data-tone="warning">
      <AlertTriangle aria-hidden="true" />
      <AlertTitle>เหตุฉุกเฉินในวิทยาเขต</AlertTitle>
      <AlertDescription>หากมีอันตรายต่อชีวิตหรือทรัพย์สิน ให้ติดต่อหน่วยงานรักษาความปลอดภัยของมหาวิทยาลัยโดยตรงทันที</AlertDescription>
    </Alert>
  </aside>
}
