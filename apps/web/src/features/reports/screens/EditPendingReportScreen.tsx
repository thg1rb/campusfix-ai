"use client"

import { useState } from "react"
import { FilePenLine } from "lucide-react"
import { BackButton } from "@/components/shared/BackButton"
import { CampusHeading } from "@/components/shared/CampusHeading"
import { Badge } from "@/components/ui/badge"
import { reportCampus } from "../components/ReportFormGuidance"
import { AccessNotice, PageFrame } from "@/components/shared/Controls"
import { EmptyState } from "@/components/shared/EmptyState"
import { isExclusiveAdmin } from "@/lib/domain/permissions"
import { usePrototype } from "@/lib/store/PrototypeStore"
import { ReportForm } from "../components/ReportForm"

function EditForm({ reportNumber }: { reportNumber: string }) {
  const { state, user } = usePrototype()
  const [original] = useState(() => state?.reports.find(item => item.reportNumber === reportNumber && item.reporterId === user?.id && item.status === "PENDING_REVIEW"))
  if (!original) return <PageFrame><BackButton href="/my-reports" label="กลับรายงานของฉัน" /><EmptyState title="ไม่พบรายงานที่รอการตรวจสอบและแก้ไขได้" /></PageFrame>
  return <PageFrame>
    <BackButton href="/my-reports" label="กลับรายงานของฉัน" breadcrumb={{ parent: "รายงานของฉัน", current: `แก้ไข ${original.reportNumber}` }} />
    <CampusHeading title="แก้ไขรายงานที่รอตรวจสอบ" context={reportCampus} icon={FilePenLine}
      subtitle="หลังบันทึก ระบบ AI จะวิเคราะห์ข้อมูลล่าสุดและส่งผลให้ผู้ตรวจสอบพิจารณาอีกครั้ง">
      <Badge variant="outline" data-tone="info" className="tabular-nums">{original.reportNumber} · เวอร์ชัน {original.version}</Badge>
    </CampusHeading>
    <ReportForm existing={original} edit />
  </PageFrame>
}

export default function EditPendingReportScreen({ reportNumber }: { reportNumber: string }) {
  const { user } = usePrototype()
  if (!user || isExclusiveAdmin(user)) return <AccessNotice loggedIn={!!user} path={`/my-reports/${reportNumber}/edit`} />
  return <EditForm key={`${user.id}:${reportNumber}`} reportNumber={reportNumber} />
}
