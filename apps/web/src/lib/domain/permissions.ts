import type { ActiveTicketStatus, FinalTicketStatus, Report, Role, Ticket, User } from '../../types/domain';

export function isActiveTicket(status: unknown): status is ActiveTicketStatus {
  return status === 'CONFIRMED' || status === 'IN_PROGRESS' || status === 'WAITING_INFORMATION';
}

export function isFinalTicket(status: unknown): status is FinalTicketStatus {
  return status === 'RESOLVED';
}

export function isExclusiveAdmin(user: User | null): boolean {
  return !!user && user.roles.includes('ADMINISTRATOR');
}

export function canReadReport(user: User | null, report: Report): boolean {
  if (report.status === 'CONFIRMED') return true;
  if (!user?.isActive || isExclusiveAdmin(user)) return false;
  return user.id === report.reporterId ||
    (user.roles.includes('REVIEWER') && (report.status === 'PENDING_REVIEW' || report.status === 'REJECTED'));
}

/** BR-ROLE-002 & BR-ROLE-003 */
export function validateUserRolesAndDepartment(roles: Role[], departmentId: string | null): string | null {
  if (departmentId !== null && typeof departmentId !== 'string') return 'สังกัดได้เพียง 1 หน่วยงาน';
  if (roles.includes('ADMINISTRATOR') && roles.length > 1) {
    return 'บทบาทผู้ดูแลระบบ (Administrator) ไม่สามารถใช้ร่วมกับบทบาทอื่นในบัญชีเดียวกันได้';
  }
  if (roles.includes('ADMINISTRATOR') && departmentId !== null) {
    return 'บัญชีผู้ดูแลระบบไม่สามารถสังกัดหน่วยงานได้';
  }
  if (roles.includes('DEPARTMENT_STAFF') && !departmentId) {
    return 'เจ้าหน้าที่หน่วยงานต้องสังกัดหน่วยงาน 1 แห่ง';
  }
  if (!roles.includes('DEPARTMENT_STAFF') && departmentId !== null) {
    return 'เฉพาะบทบาทเจ้าหน้าที่หน่วยงานเท่านั้นที่สังกัดหน่วยงานได้';
  }
  return null;
}

/** BR-ROLE-004: Reviewer cannot review/confirm/reject their own Report */
export function canReviewReport(user: User | null, report: Report): { allowed: boolean; reason?: string } {
  if (!user?.isActive || isExclusiveAdmin(user) || !user.roles.includes('REVIEWER')) return { allowed: false, reason: 'ต้องมีสิทธิ์ Reviewer' };
  if (report.reporterId === user.id) {
    return { allowed: false, reason: 'ไม่สามารถตรวจสอบรายงานที่ตนเองเป็นผู้แจ้งได้ (Separation of Duties)' };
  }
  return { allowed: true };
}

/** Helper: Checks if user has ANY Confirmed Report in the Ticket */
export function isReporterOfTicket(userId: string, ticketId: string, reports: Report[]): boolean {
  return reports.some(r => r.ticketId === ticketId && r.status === 'CONFIRMED' && r.reporterId === userId);
}

/** BR-ROLE-004, BR-ROLE-005, BR-ROLE-007 */
export function canOperateAsDepartmentOnTicket(
  user: User | null,
  ticket: Ticket,
  reports: Report[]
): { allowed: boolean; reason?: string } {
  if (!user?.isActive || isExclusiveAdmin(user) || !user.roles.includes('DEPARTMENT_STAFF') || !user.departmentId) {
    return { allowed: false, reason: 'ต้องเป็นเจ้าหน้าที่หน่วยงานที่รับผิดชอบ' };
  }
  if (!ticket.departments.some(d => d.departmentId === user.departmentId)) {
    return { allowed: false, reason: 'หน่วยงานของคุณไม่ได้รับผิดชอบ Ticket นี้' };
  }
  if (isReporterOfTicket(user.id, ticket.id, reports)) {
    return { allowed: false, reason: 'ไม่สามารถดำเนินการกับ Ticket ที่ตนเองเป็นผู้แจ้งได้ (Separation of Duties)' };
  }
  return { allowed: true };
}

export function canReviewOrManageTicket(
  user: User | null,
  ticket: Ticket,
  reports: Report[]
): { allowed: boolean; reason?: string } {
  if (!user?.isActive || isExclusiveAdmin(user) || !user.roles.includes('REVIEWER')) return { allowed: false, reason: 'ต้องมีสิทธิ์ Reviewer' };
  if (isReporterOfTicket(user.id, ticket.id, reports)) {
    return { allowed: false, reason: 'ไม่สามารถดำเนินการกับ Ticket ที่ตนเองเป็นผู้แจ้งได้ (Separation of Duties)' };
  }
  return { allowed: true };
}

/** BR-THR-001..005: Private Additional Information Thread */
export function canAccessTicketThread(user: User | null, ticket: Ticket, reports: Report[]): boolean {
  if (!user?.isActive || isExclusiveAdmin(user)) return false;
  if (isReporterOfTicket(user.id, ticket.id, reports)) return true;
  if (user.roles.includes('REVIEWER')) return true;
  if (user.roles.includes('DEPARTMENT_STAFF') && user.departmentId) {
    return ticket.departments.some(d => d.departmentId === user.departmentId);
  }
  return false;
}

/** Phase 18: Active conversation or retained history for current participants. */
export function canViewTicketThread(user: User | null, ticket: Ticket, reports: Report[], hasMessages: boolean): boolean {
  return (ticket.status === 'WAITING_INFORMATION' || (ticket.status === 'IN_PROGRESS' && hasMessages))
    && canAccessTicketThread(user, ticket, reports);
}

export function canPostTicketThread(user: User | null, ticket: Ticket, reports: Report[]): boolean {
  return ticket.status === 'WAITING_INFORMATION' && canAccessTicketThread(user, ticket, reports);
}

/** BR-AFF-001..005 */
export function canToggleAffected(user: User | null, ticket: Ticket): { allowed: boolean; reason?: string } {
  if (!user?.isActive) return { allowed: false, reason: 'กรุณาเข้าสู่ระบบก่อนกดฉันได้รับผลกระทบ' };
  if (isExclusiveAdmin(user)) return { allowed: false, reason: 'บัญชีผู้ดูแลระบบไม่สามารถกดได้รับผลกระทบได้' };
  if (!isActiveTicket(ticket.status)) return { allowed: false, reason: 'Ticket นี้สิ้นสุดแล้ว ไม่สามารถกดเพิ่มได้' };
  return { allowed: true };
}

/** BR-FBK-001..004 */
export function canSubmitOrEditFeedback(
  user: User | null,
  ticket: Ticket,
  reports: Report[]
): { allowed: boolean; reason?: string } {
  if (!user?.isActive) return { allowed: false, reason: 'กรุณาเข้าสู่ระบบ' };
  if (isExclusiveAdmin(user) || ticket.status !== 'RESOLVED') return { allowed: false, reason: 'ให้คะแนนได้เฉพาะ Ticket ที่แก้ไขเสร็จแล้ว (RESOLVED)' };
  if (!isReporterOfTicket(user.id, ticket.id, reports)) {
    return { allowed: false, reason: 'เฉพาะผู้แจ้งที่มีรายงานยืนยันแล้วใน Ticket นี้เท่านั้นที่ให้คะแนนได้' };
  }
  return { allowed: true };
}
