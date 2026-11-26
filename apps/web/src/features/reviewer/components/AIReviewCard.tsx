import { useId, useRef } from "react"
import { AlertCircle, RotateCcw, Sparkles } from "lucide-react"
import { SeverityBadge, severityLabels } from "@/components/shared/Badges"
import { Choice, labelOptions, namedOptions } from "@/components/shared/Controls"
import { TextField } from "@/components/shared/FormControls"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { Separator } from "@/components/ui/separator"
import { isSeverity, sameDepartmentSelection } from "@/lib/domain/validation"
import type { AIAnalysisRun, Category, Department, Severity } from "@/types/domain"
import { ReviewDepartmentPicker } from "./ReviewDepartmentPicker"

export type ReviewedReportFields = {
  reportTitle: string
  categoryId: string
  severity: Severity | ""
  departmentIds: string[]
}

function OverrideBadge({ changed }: { changed: boolean }) {
  return <div aria-live="polite" className="justify-self-start empty:hidden">
    {changed && <Badge variant="outline" data-tone="neutral">ปรับแก้จาก AI</Badge>}
  </div>
}

export function AIReviewCard({ run, candidateNumber, fields, categories, departments, disabled, compact, onChange, onReset }: {
  run?: AIAnalysisRun
  candidateNumber?: string
  fields: ReviewedReportFields
  categories: Category[]
  departments: Department[]
  disabled: boolean
  compact: boolean
  onChange: (patch: Partial<ReviewedReportFields>) => void
  onReset: () => void
}) {
  const headingId = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const completed = run?.status === "COMPLETED" ? run : undefined
  const activeCategories = categories.filter(item => item.isActive)
  const activeDepartments = departments.filter(item => item.isActive)
  const originalCategory = categories.find(item => item.id === completed?.suggestedCategoryId)
  const alternative = activeCategories.find(item => item.id === completed?.alternativeCategoryId)
  const recommendedNames = completed?.recommendedDepartmentIds
    .map(id => departments.find(item => item.id === id)?.name).filter(Boolean).join(" · ")
  const changed = {
    title: !!completed && fields.reportTitle !== (completed.generatedReportTitle ?? ""),
    category: !!completed && fields.categoryId !== (originalCategory?.isActive ? originalCategory.id : ""),
    severity: !!completed && fields.severity !== (completed.suggestedSeverity ?? ""),
    departments: !!completed && !sameDepartmentSelection(fields.departmentIds,
      completed.recommendedDepartmentIds.filter(id => activeDepartments.some(item => item.id === id))),
  }

  return <section aria-labelledby={headingId} className="campus-panel min-w-0 overflow-hidden">
    <header data-tone="indigo" className="grid gap-3 border-b p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 id={headingId} ref={headingRef} tabIndex={-1} className="flex min-w-0 items-start gap-2 font-semibold">
          <Sparkles size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          ข้อเสนอแนะจาก AI และข้อมูลที่ตรวจสอบ
        </h3>
        <Badge variant="outline" data-tone="neutral" className="max-w-full whitespace-normal">ผู้ตรวจสอบตัดสินใจขั้นสุดท้าย</Badge>
      </div>
      {!compact && Object.values(changed).some(Boolean) && <Button variant="outline" type="button" disabled={disabled}
        className="justify-self-start" onClick={() => { onReset(); headingRef.current?.focus() }}>
        <RotateCcw aria-hidden="true" data-icon="inline-start" /> คืนค่าตามที่ AI แนะนำ
      </Button>}
      {run?.status === "FAILED" && <Alert data-tone="warning">
        <AlertCircle aria-hidden="true" />
        <AlertDescription>AI จำลองวิเคราะห์ไม่สำเร็จ — กรุณาตรวจสอบและกรอกข้อมูลด้วยตนเอง</AlertDescription>
      </Alert>}
    </header>
    {!compact && <FieldGroup className="gap-4 p-3 sm:p-4">
      <div className="grid min-w-0 gap-1">
        <TextField label="ชื่อรายงานที่ยืนยัน" required value={fields.reportTitle} disabled={disabled}
          onChange={reportTitle => onChange({ reportTitle })} />
        <OverrideBadge changed={changed.title} />
        {changed.title && completed?.generatedReportTitle && <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
          AI แนะนำ · {completed.generatedReportTitle}
        </p>}
      </div>
      <div className="grid min-w-0 gap-1">
        <Choice label="ประเภทปัญหา" value={fields.categoryId} options={namedOptions(activeCategories)} disabled={disabled}
          onChange={categoryId => onChange({ categoryId })} />
        <OverrideBadge changed={changed.category} />
        {completed?.categoryConfidence != null && <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
          AI แนะนำ{changed.category && originalCategory ? ` · ${originalCategory.name}` : ""} · ความมั่นใจ {completed.categoryConfidence}%
        </p>}
        {alternative && <Button type="button" variant="outline" className="justify-self-start text-start"
          disabled={disabled || fields.categoryId === alternative.id} onClick={() => onChange({ categoryId: alternative.id })}>
          ทางเลือก: {alternative.name}
        </Button>}
      </div>
      <div className="grid min-w-0 gap-1">
        <Choice label="ความรุนแรง" value={fields.severity} options={labelOptions(severityLabels)} disabled={disabled}
          onChange={value => { if (isSeverity(value)) onChange({ severity: value }) }} />
        <OverrideBadge changed={changed.severity} />
        {completed?.suggestedSeverity && <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <SeverityBadge level={completed.suggestedSeverity} /> <span className="[overflow-wrap:anywhere]">{completed.severityRationale}</span>
        </div>}
      </div>
      <div className="grid min-w-0 gap-1">
        <ReviewDepartmentPicker options={activeDepartments} selected={fields.departmentIds} disabled={disabled}
          onChange={departmentIds => onChange({ departmentIds })} />
        <OverrideBadge changed={changed.departments} />
        {completed && <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
          AI แนะนำ · {recommendedNames || "ไม่มีหน่วยงานที่แนะนำ"}
        </p>}
      </div>
    </FieldGroup>}
    {completed && <>
      {!compact && <Separator />}
      <p className="px-3 py-2.5 text-sm text-muted-foreground [overflow-wrap:anywhere] sm:px-4">
        <span className="font-medium text-foreground">การจัดกลุ่มที่ AI แนะนำ</span> · {completed.matchDecision === "MATCHED" && candidateNumber
          ? `คล้ายกับเรื่อง ${candidateNumber} (ความคล้าย ${completed.candidateSimilarity}%)`
          : "เสนอให้พิจารณาเปิดเรื่องใหม่"}
      </p>
    </>}
  </section>
}
