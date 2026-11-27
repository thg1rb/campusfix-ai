import {
  AlertOctagon,
  AlertTriangle,
  ArrowDownCircle,
  BadgeCheck,
  Ban,
  CheckCircle2,
  Clock,
  FileEdit,
  MessageSquareWarning,
  MinusCircle,
  Slash,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

const ticket = {
  CONFIRMED: ["ยืนยันแล้ว", "info", CheckCircle2],
  IN_PROGRESS: ["กำลังดำเนินการ", "warning", Wrench],
  WAITING_INFORMATION: ["รอข้อมูลเพิ่มเติม", "waiting", MessageSquareWarning],
  RESOLVED: ["แก้ไขเสร็จแล้ว", "success", BadgeCheck],
} as const;

const report = {
  DRAFT: ["ฉบับร่าง", "neutral", FileEdit],
  PENDING_REVIEW: ["รอการตรวจสอบ", "warning", Clock],
  CONFIRMED: ["ยืนยันแล้ว", "success", CheckCircle2],
  REJECTED: ["ไม่ผ่านการตรวจสอบ", "danger", Ban],
  CANCELLED: ["ยกเลิกแล้ว", "disabled", Slash],
} as const;

const severity = {
  CRITICAL: ["วิกฤต", "critical", AlertOctagon],
  HIGH: ["สูง", "high", AlertTriangle],
  MEDIUM: ["ปานกลาง", "royal", MinusCircle],
  LOW: ["ต่ำ", "neutral", ArrowDownCircle],
} as const;

export const ticketStatusLabels = Object.fromEntries(
  Object.entries(ticket).map(([key, value]) => [key, value[0]]),
);
export const reportStatusLabels = Object.fromEntries(
  Object.entries(report).map(([key, value]) => [key, value[0]]),
);
export const severityLabels = Object.fromEntries(
  Object.entries(severity).map(([key, value]) => [key, value[0]]),
);

function SemanticBadge({ value }: { value: readonly [string, string, LucideIcon] }) {
  const [label, tone, Icon] = value;
  return (
    <Badge variant="outline" data-tone={tone} className="max-w-full whitespace-normal">
      <Icon aria-hidden="true" />
      {label}
    </Badge>
  );
}

export function StatusBadge({ status }: { status: keyof typeof ticket }) {
  return <SemanticBadge value={ticket[status]} />;
}
export function ReportStatusBadge({ status }: { status: keyof typeof report }) {
  return <SemanticBadge value={report[status]} />;
}
export function SeverityBadge({ level }: { level: keyof typeof severity }) {
  return <SemanticBadge value={severity[level]} />;
}
