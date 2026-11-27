import type {
  Report,
  ReportStatus,
  Ticket,
  TicketDepartmentAssignment,
  TicketStatus,
  User,
} from "../../types/domain";
import { canReviewReport, isActiveTicket } from "./permissions";
import { requireRule, requiredText } from "./validation";

const reportTransitions: Record<ReportStatus, readonly ReportStatus[]> = {
  DRAFT: ["DRAFT", "PENDING_REVIEW"],
  PENDING_REVIEW: ["PENDING_REVIEW", "CONFIRMED", "REJECTED", "CANCELLED"],
  CONFIRMED: [],
  REJECTED: [],
  CANCELLED: [],
};

const ticketTransitions: Record<TicketStatus, readonly TicketStatus[]> = {
  CONFIRMED: ["IN_PROGRESS", "WAITING_INFORMATION"],
  IN_PROGRESS: ["WAITING_INFORMATION", "RESOLVED"],
  WAITING_INFORMATION: ["IN_PROGRESS"],
  RESOLVED: [],
};

export function assertReportTransition(report: Report, to: ReportStatus) {
  requireRule(
    reportTransitions[report.status].includes(to),
    "TRANSITION_FORBIDDEN",
    "ไม่สามารถเปลี่ยนสถานะรายงานได้",
  );
}

export function assertReviewDecision(
  user: User | null,
  report: Report,
  version: number,
  to: "CONFIRMED" | "REJECTED",
) {
  const guard = canReviewReport(user, report);
  requireRule(guard.allowed, "FORBIDDEN", guard.reason ?? "");
  assertReportTransition(report, to);
  requireRule(
    report.version === version,
    "STALE_REPORT_VERSION",
    "รายงานนี้ถูกผู้แจ้งแก้ไขระหว่างที่คุณกำลังตรวจสอบ กรุณาโหลดข้อมูลล่าสุดก่อนยืนยันหรือปฏิเสธ",
  );
}

export function assertActive(ticket: Ticket) {
  requireRule(isActiveTicket(ticket.status), "TICKET_IS_FINAL", "เรื่องนี้สิ้นสุดแล้ว");
}

export function transitionTicket(
  ticket: Ticket,
  to: TicketStatus,
  now: string,
  reason = "",
): Ticket {
  assertActive(ticket);
  requireRule(
    ticketTransitions[ticket.status].includes(to) && to !== "RESOLVED",
    "TRANSITION_FORBIDDEN",
    "ไม่สามารถเปลี่ยนสถานะจากขั้นตอนนี้ได้",
  );
  if (to === "WAITING_INFORMATION") requiredText(reason, "กรุณากรอกคำถามเพิ่มเติม");
  return { ...ticket, status: to, updatedAt: now };
}

export function allComplete(departments: TicketDepartmentAssignment[]) {
  return departments.length > 0 && departments.every((department) => department.isCompleted);
}

function autoResolveTicket(ticket: Ticket, now: string): Ticket {
  if (!allComplete(ticket.departments)) return ticket;
  return {
    ...ticket,
    status: "RESOLVED",
    resolvedAt: now,
    updatedAt: now,
    resolutionSummary:
      ticket.departments
        .map((item) => item.completionNote)
        .filter(Boolean)
        .join("\n") || "หน่วยงานที่รับผิดชอบดำเนินการเสร็จสิ้นครบแล้ว",
  };
}

export function replaceDepartments(ticket: Ticket, ids: string[], actorId: string, now: string) {
  assertActive(ticket);
  const uniqueIds = [...new Set(ids)];
  requireRule(uniqueIds.length > 0, "DEPARTMENT_REQUIRED", "ต้องมีหน่วยงานที่รับผิดชอบอย่างน้อย 1 แห่ง");
  const departments = uniqueIds.map(
    (departmentId) =>
      ticket.departments.find((item) => item.departmentId === departmentId) ?? {
        departmentId,
        assignedAt: now,
        assignedBy: actorId,
        isCompleted: false,
        completedAt: null,
        completedBy: null,
        completionNote: null,
      },
  );
  return autoResolveTicket({ ...ticket, departments, updatedAt: now }, now);
}

export function completeDepartment(
  ticket: Ticket,
  departmentId: string,
  actorId: string,
  note: string,
  now: string,
) {
  assertActive(ticket);
  requireRule(
    ticket.status === "IN_PROGRESS",
    "TRANSITION_FORBIDDEN",
    "ยืนยันได้เมื่อเรื่องอยู่ระหว่างดำเนินการ",
  );
  const assignment = ticket.departments.find((item) => item.departmentId === departmentId);
  requireRule(
    assignment && !assignment.isCompleted,
    "FORBIDDEN",
    "หน่วยงานนี้ดำเนินการเสร็จสิ้นแล้วหรือไม่ได้รับมอบหมาย",
  );
  const departments = ticket.departments.map((item) =>
    item === assignment
      ? {
          ...item,
          isCompleted: true,
          completedAt: now,
          completedBy: actorId,
          completionNote: note.trim() || null,
        }
      : item,
  );
  return autoResolveTicket({ ...ticket, departments, updatedAt: now }, now);
}
