"use client"

import { useState } from "react"
import { FilePlus2 } from "lucide-react"
import { CampusHeading } from "@/components/shared/CampusHeading"
import { reportCampus, reportRoutingHint } from "../components/ReportFormGuidance"
import { AccessNotice, PageFrame } from "@/components/shared/Controls"
import { EmptyState } from "@/components/shared/EmptyState"
import { isExclusiveAdmin } from "@/lib/domain/permissions"
import { usePrototype } from "@/lib/store/PrototypeStore"
import { ReportForm } from "../components/ReportForm"

function CreateForm({ draftId, targetId }: { draftId?: string; targetId?: string }) {
  const { state, user } = usePrototype()
  const [draft] = useState(() => state?.reports.find(item => item.id === draftId && item.status === "DRAFT" && item.reporterId === user?.id))
  if (draftId && !draft) return <PageFrame><EmptyState title="ไม่พบฉบับร่างที่แก้ไขได้" /></PageFrame>
  return <PageFrame>
    <CampusHeading title={draft ? "แก้ไขฉบับร่าง" : "แจ้งปัญหาใหม่"} context={reportCampus} subtitle={reportRoutingHint} icon={FilePlus2} />
    <ReportForm existing={draft} targetId={targetId} />
  </PageFrame>
}

export default function CreateReportScreen({ draftId, targetId }: { draftId?: string; targetId?: string }) {
  const { user } = usePrototype()
  if (!user || isExclusiveAdmin(user)) return <AccessNotice loggedIn={!!user} path={`/reports/new${targetId ? `?targetTicketNumber=${encodeURIComponent(targetId)}` : draftId ? `?draftId=${encodeURIComponent(draftId)}` : ""}`} />
  return <CreateForm key={`${user.id}:${draftId ?? targetId ?? ""}`} draftId={draftId} targetId={targetId} />
}
