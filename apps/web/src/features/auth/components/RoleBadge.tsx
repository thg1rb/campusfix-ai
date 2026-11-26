import { ClipboardCheck, FileText, ShieldCheck, Wrench } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { Role } from "@/types/domain"
import { roleLabels } from "../roleLabels"

const styles = {
  ADMINISTRATOR: { icon: ShieldCheck, tone: "violet" },
  REVIEWER: { icon: ClipboardCheck, tone: "indigo" },
  DEPARTMENT_STAFF: { icon: Wrench, tone: "teal" },
  REPORTER: { icon: FileText, tone: "info" },
}

export function RoleBadge({ role }: { role: Role }) {
  const { icon: Icon, tone } = styles[role]
  return <Badge variant="outline" data-tone={tone}><Icon aria-hidden="true" />{roleLabels[role]}</Badge>
}
