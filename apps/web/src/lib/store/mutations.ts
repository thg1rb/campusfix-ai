import { createSeed, type PrototypeState } from "../../data/seed"
import type { AuditLogEntry, CampusLocation, Category, Department, FeedbackSubmission, MajorEmailEventType, PublicActivityEvent, Report, ReportImage, Role, Severity, ThreadMessage, Ticket, User } from "../../types/domain"
import { analyzeReport, reevaluateTicket } from "../ai/mockAiService"
import { brandEmailSubject } from "../brand"
import { issueNumber } from "../domain/numbers"
import { feedbackKeys } from "../domain/analytics"
import { canOperateAsDepartmentOnTicket, canPostTicketThread, canReviewOrManageTicket, canReviewReport, canSubmitOrEditFeedback, canToggleAffected, isExclusiveAdmin, isReporterOfTicket, validateUserRolesAndDepartment } from "../domain/permissions"
import { expiredReports } from "../domain/retention"
import { assertActive, assertReportTransition, assertReviewDecision, completeDepartment, replaceDepartments, transitionTicket } from "../domain/transitions"
import { imageError, inCampus, isSeverity, isEligibleGoogleAccount, requireRule, requiredText, sameDepartmentSelection, usernameError, validLocation, validateReport, type ReportFields } from "../domain/validation"

type VerifiedReportFields = { reportTitle: string; categoryId: string; severity: Severity; departmentIds: string[] }
type Decision = { kind: "reject"; reason: string } | (VerifiedReportFields & (
  { kind: "existing"; ticketId: string } | { kind: "new"; title: string; summary: string }
))

export type StoreAction =
  | { type: "login"; userId: string | null }
  | { type: "config"; key: keyof PrototypeState["demoConfig"]; value: boolean }
  | { type: "reset" } | { type: "purge" }
  | { type: "retryEmail"; id: string }
  | { type: "username"; username: string }
  | { type: "saveReport"; id?: string; targetId?: string; fields: ReportFields; draft: boolean; edit?: boolean }
  | { type: "cancelReport"; id: string } | { type: "simulateEdit"; id: string }
  | { type: "review"; id: string; version: number; decision: Decision }
  | { type: "correctReport"; id: string; title: string; fields: Pick<ReportFields, "description" | "location"> }
  | { type: "departments"; id: string; ids: string[] }
  | { type: "reevaluate"; id: string; resolution: "apply" | "keep" | "manual"; title?: string; summary?: string; severity?: Severity; departmentIds?: string[] }
  | { type: "status"; id: string; status: "IN_PROGRESS" | "WAITING_INFORMATION"; workspace: "reviewer" | "department"; reason?: string }
  | { type: "operation"; id: string; complete: boolean; note: string; evidence: ReportImage[] }
  | { type: "thread"; id: string; body: string }
  | { type: "affected"; id: string }
  | { type: "feedback"; id: string; ratings: FeedbackSubmission["ratings"]; comment?: string }
  | { type: "user"; id: string; roles: Role[]; departmentId: string | null; isActive: boolean }
  | { type: "master"; collection: "categories"; item: Category }
  | { type: "master"; collection: "departments"; item: Department }
  | { type: "master"; collection: "locations"; item: CampusLocation }

export function currentUser(state: PrototypeState) {
  return state.users.find(user => user.id === state.currentUserId && user.isActive) ?? null
}

function fetchById<T extends { id: string }>(all: T[], id: string) {
  const entity = all.find(item => item.id === id)
  requireRule(entity, "NOT_FOUND", "ไม่พบข้อมูลที่ระบุ")
  return entity
}

function put<T extends { id: string }>(all: T[], item: T) {
  const old = all.findIndex(row => row.id === item.id)
  if (old === -1) all.push(item)
  else all[old] = item
}

function allow(guard: { allowed: boolean; reason?: string }) {
  requireRule(guard.allowed, "FORBIDDEN", guard.reason ?? "คุณไม่มีสิทธิ์ดำเนินการ")
}

function assertStaff(user: User, ticket: Ticket, reports: Report[]) {
  allow(canOperateAsDepartmentOnTicket(user, ticket, reports))
  requireRule(user.departmentId, "FORBIDDEN", "กรุณาตรวจสอบหน่วยงานที่สังกัด")
  return user.departmentId
}

const eventLabels: Record<MajorEmailEventType, string> = {
  CONFIRMED_NEW_TICKET: "ยืนยันและเปิดเรื่องใหม่แล้ว",
  CONFIRMED_EXISTING_TICKET: "ยืนยันและเพิ่มรายงานในเรื่องเดิมแล้ว",
  WAITING_INFORMATION: "ขอข้อมูลเพิ่มเติม",
  RESOLVED: "แก้ไขเสร็จแล้ว",
}

export function applyAction(previous: PrototypeState, action: StoreAction, now = new Date().toISOString()) {
  if (action.type === "reset") return { state: createSeed(Date.parse(now), previous.numberSequences), data: undefined }
  const state = structuredClone(previous)
  const actor = currentUser(state)
  const uid = () => globalThis.crypto.randomUUID()
  const done = (data?: string | number) => ({ state, data })
  function audit(entityType: AuditLogEntry["entityType"], entityId: string, name: string, details: Record<string, unknown> = {}, override?: User | "AI_SERVICE" | "SYSTEM") {
    const author = override ?? actor
    state.auditLogs.unshift({
      id: uid(), entityType, entityId, action: name,
      actorId: typeof author === "string" ? author : author?.id ?? "SYSTEM",
      actorRoles: typeof author === "string" ? [author] : author?.roles ?? ["SYSTEM"],
      departmentId: typeof author === "object" ? author?.departmentId ?? null : null,
      details: {
        ...(entityType === "TICKET" && { ticketNumber: state.tickets.find(ticket => ticket.id === entityId)?.ticketNumber }),
        ...(entityType === "REPORT" && { reportNumber: state.reports.find(report => report.id === entityId)?.reportNumber }),
        ...details,
      }, createdAt: now,
    })
  }

  function notify(eventType: MajorEmailEventType, ticket: Ticket, only?: Report) {
    const reports = only ? [only] : state.reports.filter(item => item.status === "CONFIRMED" && item.ticketId === ticket.id)
    for (const userId of new Set(reports.map(item => item.reporterId))) {
      const user = fetchById(state.users, userId)
      state.emailLogs.unshift({
        id: uid(), eventType, ticketId: ticket.id, reportId: only?.id ?? null, recipientUserId: userId, recipientEmail: user.email,
        subject: brandEmailSubject(`${ticket.ticketNumber} · ${eventLabels[eventType]}`), bodyPreview: `${ticket.title} — ${eventLabels[eventType]}`,
        status: state.demoConfig.simulateEmailFailure ? "FAILED" : "SENT", createdAt: now,
      })
    }
  }

  function activity(ticket: Ticket, oldStatus: Ticket["status"] | null, type: PublicActivityEvent["type"], summary: string, role: PublicActivityEvent["actorRole"], departmentId: string | null = null, evidenceImages: ReportImage[] = []) {
    state.publicActivities.push({ id: uid(), ticketId: ticket.id, type, actorId: role === "SYSTEM" ? "SYSTEM" : actor!.id,
      actorRole: role, departmentId, oldStatus, newStatus: ticket.status, summary, evidenceImages, createdAt: now })
  }

  function recordResolution(before: Ticket, after: Ticket) {
    if (after.status !== "RESOLVED" || before.status === "RESOLVED") return
    activity(after, before.status, "AUTO_RESOLVED", "ทุกหน่วยงานดำเนินการเสร็จสิ้น ระบบจึงเปลี่ยนสถานะเป็นแก้ไขเสร็จแล้ว", "SYSTEM")
    audit("TICKET", after.id, "AUTO_RESOLVED", { from: before.status }, "SYSTEM")
    notify("RESOLVED", after)
  }

  function runAnalysis(report: Report) {
    state.aiRuns = state.aiRuns.map(run => run.reportId === report.id ? { ...run, isOutdated: true } : run)
    const run = analyzeReport(report, state, state.demoConfig.simulateAiFailure, now)
    state.aiRuns.push(run)
    audit("AI_RUN", run.id, "ANALYZE_REPORT", { ...run, reportNumber: report.reportNumber,
      ticketNumber: state.tickets.find(ticket => ticket.id === run.candidateTicketId)?.ticketNumber }, "AI_SERVICE")
    return { ...report, aiGeneratedTitle: run.generatedReportTitle }
  }

  function reevaluation(ticket: Ticket, report: Report) {
    const suggestion = reevaluateTicket(ticket, report, state, state.demoConfig.simulateAiFailure, now)
    audit("AI_RUN", suggestion.id, "REEVALUATE_TICKET", { ...suggestion, ticketNumber: ticket.ticketNumber }, "AI_SERVICE")
    return { ...ticket, pendingReevaluation: suggestion, updatedAt: now }
  }

  function assign(ticket: Ticket, ids: string[], reviewer: User) {
    for (const id of ids) {
      const department = fetchById(state.departments, id)
      requireRule(department.isActive || ticket.departments.some(item => item.departmentId === id),
        "INACTIVE_DEPARTMENT", "กรุณาเลือกหน่วยงานที่เปิดใช้งาน")
    }
    const updated = replaceDepartments(ticket, ids, reviewer.id, now)
    const before = ticket.departments.map(item => item.departmentId)
    const changes = { added: ids.filter(id => !before.includes(id)), removed: before.filter(id => !ids.includes(id)) }
    for (const id of changes.added) activity({ ...updated, status: ticket.status }, ticket.status, "DEPARTMENT_ADDED", "เพิ่มหน่วยงานที่รับผิดชอบ", "REVIEWER", id)
    for (const id of changes.removed) activity({ ...updated, status: ticket.status }, ticket.status, "DEPARTMENT_REMOVED", "นำหน่วยงานออกจากเรื่อง", "REVIEWER", id)
    audit("TICKET", ticket.id, "CHANGE_DEPARTMENTS", { ...changes, ticketNumber: ticket.ticketNumber })
    recordResolution(ticket, updated)
    return updated
  }

  function post(ticketId: string, author: User, role: ThreadMessage["authorRole"], body: string) {
    state.threadMessages.push({ id: uid(), ticketId, authorId: author.id, authorRole: role,
      authorDepartmentId: role === "DEPARTMENT_STAFF" ? author.departmentId : null, body: requiredText(body, "กรุณากรอกข้อความ"), createdAt: now })
  }

  if (action.type === "login") {
    if (action.userId) {
      const account = fetchById(state.users, action.userId)
      requireRule(account.isActive, "FORBIDDEN", "บัญชีนี้ถูกปิดใช้งาน")
      requireRule(isEligibleGoogleAccount(account), "INVALID_ACCOUNT_DOMAIN", "ระบบรองรับเฉพาะบัญชี Google (@ku.th)")
    }
    state.currentUserId = action.userId
    return done()
  }
  if (action.type === "config") {
    state.demoConfig[action.key] = action.value
    return done()
  }
  if (action.type === "retryEmail") {
    const message = fetchById(state.emailLogs, action.id)
    if (message.status === "FAILED" && !state.demoConfig.simulateEmailFailure) message.status = "SENT"
    return done()
  }
  if (action.type === "purge") {
    const expired = expiredReports(state.reports, Date.parse(now))
    const ids = new Set(expired.map(report => report.id))
    state.reports = state.reports.filter(report => !ids.has(report.id))
    state.aiRuns = state.aiRuns.filter(run => !ids.has(run.reportId))
    expired.forEach(report => audit("RETENTION", report.id, "PURGE_REPORT", { status: report.status, reportNumber: report.reportNumber }))
    return done(expired.length)
  }

  requireRule(actor, "LOGIN_REQUIRED", "กรุณาเข้าสู่ระบบก่อนดำเนินการ")
  if (action.type === "username") {
    const username = action.username.trim()
    const error = usernameError(username, state.users, actor.id)
    requireRule(!error, "INVALID_USERNAME", error ?? "")
    audit("USER", actor.id, "CHANGE_USERNAME", { from: actor.username, to: username })
    actor.username = username
    return done()
  }

  if (action.type === "user" || action.type === "master") {
    requireRule(isExclusiveAdmin(actor), "FORBIDDEN", "เฉพาะผู้ดูแลระบบ")
    if (action.type === "user") {
      const user = fetchById(state.users, action.id)
      const roles = [...new Set(action.roles)]
      const error = validateUserRolesAndDepartment(roles, action.departmentId)
      requireRule(!error, "INVALID_ROLES", error ?? "")
      requireRule(roles.length > 0, "INVALID_ROLES", "กรุณาเลือกอย่างน้อย 1 บทบาท")
      if (action.departmentId) {
        const department = fetchById(state.departments, action.departmentId)
        requireRule(department.isActive || department.id === user.departmentId, "INACTIVE_DEPARTMENT", "กรุณาเลือกหน่วยงานที่เปิดใช้งาน")
      }
      const { departmentId, isActive } = action
      const updated = { ...user, roles, departmentId, isActive }
      const otherAdmin = state.users.some(item => item.id !== user.id && item.isActive && isExclusiveAdmin(item))
      requireRule(otherAdmin || (isActive && isExclusiveAdmin(updated)), "LAST_ADMIN", "ต้องมีผู้ดูแลระบบที่เปิดใช้งานอย่างน้อย 1 บัญชี")
      put(state.users, updated)
      audit("USER", user.id, "MANAGE_USER", { before: { roles: user.roles, departmentId: user.departmentId, isActive: user.isActive }, after: { roles, departmentId, isActive } })
      return done()
    }
    const item = { ...action.item, name: requiredText(action.item.name, "กรุณากรอกชื่อ") }
    requireRule(!state[action.collection].some(row => row.id !== item.id && row.name.toLowerCase() === item.name.toLowerCase()),
      "DUPLICATE_NAME", "ชื่อนี้ถูกใช้แล้ว")
    if (action.collection === "locations") {
      requireRule(inCampus(action.item), "INVALID_LOCATION", "กรุณาปักหมุดภายในวิทยาเขตบางเขน")
      put(state.locations, { ...action.item, name: item.name })
    } else if (action.collection === "categories") put(state.categories, { ...action.item, name: item.name })
    else put(state.departments, { ...action.item, name: item.name })
    const entityType = { categories: "CATEGORY", departments: "DEPARTMENT", locations: "LOCATION" } as const
    audit(entityType[action.collection], item.id, "SAVE_MASTER_DATA", { ...item })
    return done()
  }

  requireRule(!isExclusiveAdmin(actor), "FORBIDDEN", "บัญชีผู้ดูแลระบบใช้สำหรับจัดการระบบ")
  if (action.type === "saveReport") {
    const old = action.id ? fetchById(state.reports, action.id) : null
    const status = action.draft ? "DRAFT" : "PENDING_REVIEW"
    if (old) {
      requireRule(old.reporterId === actor.id && old.status === (action.edit ? "PENDING_REVIEW" : "DRAFT"),
        "FORBIDDEN", "ไม่สามารถแก้ไขรายงานนี้ได้")
      assertReportTransition(old, status)
    }
    validateReport(action.fields, action.draft)
    const targetId = old?.requestedTargetTicketId ?? action.targetId ?? null
    if (targetId && old?.status !== "PENDING_REVIEW") assertActive(fetchById(state.tickets, targetId))
    const id = old?.id ?? uid()
    const reportNumber = status === "DRAFT" ? null : old?.reportNumber ?? issueNumber(state.numberSequences, "RPT", now)
    const report: Report = {
      ...action.fields, description: action.fields.description.trim(), id, reportNumber, reporterId: actor.id,
      status, version: old?.status === "PENDING_REVIEW" ? old.version + 1 : old?.version ?? 1,
      aiGeneratedTitle: null, requestedTargetTicketId: targetId, ticketId: null, rejectionReason: null, reviewedBy: null,
      reviewedAt: null, createdAt: old?.createdAt ?? now, submittedAt: status === "DRAFT" ? null : old?.submittedAt ?? now, updatedAt: now,
      cancelledAt: null,
    }
    put(state.reports, status === "PENDING_REVIEW" ? runAnalysis(report) : report)
    audit("REPORT", id, action.draft ? "SAVE_DRAFT" : action.edit ? "EDIT_PENDING" : "SUBMIT", { version: report.version, targetId })
    return done(id)
  }

  if (action.type === "cancelReport" || action.type === "simulateEdit" || action.type === "review" || action.type === "correctReport") {
    const report = fetchById(state.reports, action.id)
    if (action.type === "cancelReport") {
      requireRule(report.reporterId === actor.id, "FORBIDDEN", "เฉพาะผู้แจ้งที่ยกเลิกรายงานได้")
      assertReportTransition(report, "CANCELLED")
      put(state.reports, { ...report, status: "CANCELLED", cancelledAt: now, updatedAt: now })
      audit("REPORT", report.id, "CANCEL", { version: report.version })
      return done(report.id)
    }
    if (action.type === "simulateEdit") {
      allow(canReviewReport(actor, report))
      assertReportTransition(report, "PENDING_REVIEW")
      requireRule(report.status === "PENDING_REVIEW", "FORBIDDEN", "จำลองได้เฉพาะรายงานที่รอตรวจสอบ")
      const updated = runAnalysis({ ...report, description: `${report.description}\nพบปัญหาซ้ำเมื่อมาตรวจดูอีกครั้ง`, version: report.version + 1, updatedAt: now })
      put(state.reports, updated)
      audit("REPORT", report.id, "EDIT_PENDING", { simulated: true, version: updated.version }, fetchById(state.users, report.reporterId))
      return done(report.id)
    }
    if (action.type === "correctReport") {
      requireRule(report.status === "CONFIRMED" && report.ticketId, "FORBIDDEN", "แก้ไขได้เฉพาะรายงานที่ยืนยันแล้ว")
      const ticket = fetchById(state.tickets, report.ticketId)
      allow(canReviewOrManageTicket(actor, ticket, state.reports))
      assertActive(ticket)
      const updated = { ...report, ...action.fields, aiGeneratedTitle: requiredText(action.title, "กรุณากรอกชื่อรายงาน"), version: report.version + 1, updatedAt: now }
      validateReport(updated)
      put(state.reports, updated)
      put(state.tickets, reevaluation(ticket, updated))
      audit("REPORT", report.id, "CORRECT_CONFIRMED", { version: updated.version })
      return done(report.id)
    }
    const decision = action.decision
    assertReviewDecision(actor, report, action.version, decision.kind === "reject" ? "REJECTED" : "CONFIRMED")
    const reviewed = { ...report, reviewedBy: actor.id, reviewedAt: now, updatedAt: now }
    if (decision.kind === "reject") {
      const reason = requiredText(decision.reason)
      put(state.reports, { ...reviewed, status: "REJECTED", rejectionReason: reason })
      audit("REPORT", report.id, "REJECT", { reason, version: report.version })
      return done(report.id)
    }
    requireRule(validLocation(report.location), "INVALID_LOCATION", "ไม่พบหมุดสถานที่ที่ถูกต้อง")
    const { categoryId, severity } = decision
    requireRule(state.categories.some(category => category.id === categoryId && category.isActive),
      "INVALID_CATEGORY", "กรุณาเลือกประเภทปัญหาที่เปิดใช้งาน")
    requireRule(isSeverity(severity), "INVALID_SEVERITY", "กรุณาเลือกระดับความรุนแรง")
    requireRule(Array.isArray(decision.departmentIds) && decision.departmentIds.length > 0,
      "DEPARTMENT_REQUIRED", "กรุณาเลือกหน่วยงานที่เปิดใช้งานอย่างน้อย 1 แห่ง")
    const departmentIds = [...new Set(decision.departmentIds)]
    requireRule(departmentIds.every(id => state.departments.some(department => department.id === id && department.isActive)),
      "INACTIVE_DEPARTMENT", "กรุณาเลือกหน่วยงานที่เปิดใช้งาน")
    const run = state.aiRuns.find(item => item.reportId === report.id && item.reportVersion === report.version && !item.isOutdated)
    const confirmed: Report = { ...reviewed, status: "CONFIRMED", aiGeneratedTitle: requiredText(decision.reportTitle, "กรุณากรอกชื่อรายงาน") }
    if (decision.kind === "existing") {
      const ticket = fetchById(state.tickets, decision.ticketId)
      assertActive(ticket)
      allow(canReviewOrManageTicket(actor, ticket, state.reports))
      confirmed.ticketId = ticket.id
      put(state.reports, confirmed)
      put(state.tickets, reevaluation(ticket, confirmed))
      activity(ticket, ticket.status, "REPORT_ATTACHED", "ตรวจสอบและเพิ่มรายงานในเรื่องเดิมแล้ว", "REVIEWER")
      notify("CONFIRMED_EXISTING_TICKET", ticket, confirmed)
    } else {
      const ticket: Ticket = {
        id: uid(), ticketNumber: issueNumber(state.numberSequences, "TKT", now), title: requiredText(decision.title, "กรุณากรอกชื่อเรื่อง"),
        summary: requiredText(decision.summary, "กรุณากรอกสรุปเรื่อง"), status: "CONFIRMED", categoryId,
        severity, location: report.location, departments: [], confirmedBy: actor.id, confirmedAt: now,
        resolvedAt: null, resolutionSummary: null,
        pendingReevaluation: null, updatedAt: now,
      }
      const updated = assign(ticket, departmentIds, actor)
      confirmed.ticketId = updated.id
      put(state.reports, confirmed)
      put(state.tickets, updated)
      activity(updated, null, "TICKET_CONFIRMED", "ตรวจสอบและยืนยันเรื่องแล้ว", "REVIEWER")
      notify("CONFIRMED_NEW_TICKET", updated, confirmed)
    }
    audit("REPORT", report.id, "CONFIRM", {
      kind: decision.kind, ticketId: confirmed.ticketId, ticketNumber: state.tickets.find(ticket => ticket.id === confirmed.ticketId)?.ticketNumber, version: report.version, reportTitle: confirmed.aiGeneratedTitle,
      categoryId, severity, departmentIds, aiRunId: run?.id ?? null,
      overrides: {
        categoryId: run?.status === "COMPLETED" && categoryId !== run.suggestedCategoryId,
        severity: run?.status === "COMPLETED" && severity !== run.suggestedSeverity,
        departmentIds: run?.status === "COMPLETED" && !sameDepartmentSelection(departmentIds, run.recommendedDepartmentIds),
      },
    })
    return done(confirmed.ticketId ?? undefined)
  }

  const ticket = fetchById(state.tickets, action.id)
  if (action.type === "affected") {
    allow(canToggleAffected(actor, ticket))
    const matches = (row: PrototypeState["affected"][number]) => row.ticketId === ticket.id && row.userId === actor.id
    if (state.affected.some(matches)) state.affected = state.affected.filter(row => !matches(row))
    else state.affected.push({ ticketId: ticket.id, userId: actor.id, createdAt: now })
  } else if (action.type === "feedback") {
    allow(canSubmitOrEditFeedback(actor, ticket, state.reports))
    requireRule(feedbackKeys.every(key => [1, 2, 3, 4, 5].includes(action.ratings[key])),
      "INVALID_RATINGS", "กรุณาให้คะแนน 1–5 ดาวครบทุกด้าน")
    const old = state.feedbacks.find(row => row.ticketId === ticket.id && row.reporterId === actor.id)
    put(state.feedbacks, { id: old?.id ?? uid(), ticketId: ticket.id, reporterId: actor.id,
      ratings: action.ratings, comment: action.comment?.trim(), createdAt: old?.createdAt ?? now, updatedAt: now })
  } else if (action.type === "thread") {
    requireRule(ticket.status === "WAITING_INFORMATION", "THREAD_READ_ONLY", "สามารถส่งข้อความเพิ่มเติมได้เฉพาะเมื่อเรื่องอยู่ในสถานะรอข้อมูลเพิ่มเติมเท่านั้น")
    requireRule(canPostTicketThread(actor, ticket, state.reports), "FORBIDDEN", "เฉพาะผู้เกี่ยวข้องเข้าถึงข้อความได้")
    const role = isReporterOfTicket(actor.id, ticket.id, state.reports) ? "REPORTER" :
      actor.roles.includes("REVIEWER") ? "REVIEWER" : "DEPARTMENT_STAFF"
    post(ticket.id, actor, role, action.body)
  } else if (action.type === "status") {
    const role = action.workspace === "department" ? "DEPARTMENT_STAFF" : "REVIEWER"
    const departmentId = role === "DEPARTMENT_STAFF" ? assertStaff(actor, ticket, state.reports) : null
    if (role === "REVIEWER") {
      allow(canReviewOrManageTicket(actor, ticket, state.reports))
      requireRule(action.status !== "IN_PROGRESS", "FORBIDDEN", "เฉพาะหน่วยงานที่รับผิดชอบเริ่มดำเนินการได้")
    }
    const updated = transitionTicket(ticket, action.status, now, action.reason)
    if (updated.status === "WAITING_INFORMATION") {
      post(ticket.id, actor, role, action.reason ?? "")
      notify("WAITING_INFORMATION", updated)
    }
    const publicSummary = updated.status === "WAITING_INFORMATION" ? "ขอข้อมูลเพิ่มเติมจากผู้แจ้ง" :
      ticket.status === "CONFIRMED" ? "เริ่มดำเนินการ" : "กลับมาดำเนินการต่อ"
    activity(updated, ticket.status, "STATUS_CHANGED", publicSummary, role, departmentId)
    audit("TICKET", ticket.id, "CHANGE_STATUS", { from: ticket.status, to: updated.status })
    put(state.tickets, updated)
  } else if (action.type === "operation") {
    const departmentId = assertStaff(actor, ticket, state.reports)
    assertActive(ticket)
    requireRule(ticket.status === "IN_PROGRESS", "TRANSITION_FORBIDDEN", "บันทึกได้เมื่อเรื่องอยู่ระหว่างดำเนินการ")
    const error = action.evidence.map(imageError).find(Boolean)
    requireRule(!error && action.evidence.length <= 5, "INVALID_EVIDENCE", error ?? "แนบหลักฐานได้สูงสุด 5 ภาพ")
    const note = action.complete ? action.note.trim() : requiredText(action.note, "กรุณากรอกรายละเอียดการดำเนินงาน")
    if (!action.complete) {
      activity(ticket, ticket.status, "DEPARTMENT_ACTION", note, "DEPARTMENT_STAFF", departmentId, action.evidence)
      audit("TICKET", ticket.id, "RECORD_ACTION", { note, evidence: action.evidence.map(image => image.id) })
      put(state.tickets, { ...ticket, updatedAt: now })
    } else {
      const updated = completeDepartment(ticket, departmentId, actor.id, note, now)
      activity(ticket, ticket.status, "DEPARTMENT_COMPLETED", note || "หน่วยงานดำเนินการเสร็จสิ้นแล้ว", "DEPARTMENT_STAFF", departmentId, action.evidence)
      audit("TICKET", ticket.id, "DEPARTMENT_COMPLETED", { note, departmentId })
      recordResolution(ticket, updated)
      put(state.tickets, updated)
    }
  } else {
    allow(canReviewOrManageTicket(actor, ticket, state.reports))
    assertActive(ticket)
    if (action.type === "departments") put(state.tickets, assign(ticket, [...new Set(action.ids)], actor))
    if (action.type === "reevaluate") {
      const run = ticket.pendingReevaluation
      requireRule(run && !run.isReviewed, "FORBIDDEN", "ไม่มีผลวิเคราะห์ใหม่ที่รอตรวจสอบ")
      const updated = { ...ticket, pendingReevaluation: { ...run, isReviewed: true }, updatedAt: now }
      if (action.resolution !== "keep") {
        requireRule(action.resolution === "manual" || run.status === "COMPLETED", "AI_FAILED", "ผลวิเคราะห์ยังไม่พร้อม")
        const manual = action.resolution === "manual"
        updated.title = requiredText((manual ? action.title : run.suggestedTitle) ?? "", "กรุณากรอกชื่อเรื่อง")
        updated.summary = requiredText((manual ? action.summary : run.suggestedSummary) ?? "", "กรุณากรอกสรุปเรื่อง")
        updated.severity = (manual ? action.severity : run.suggestedSeverity) ?? ticket.severity
        const ids = manual ? action.departmentIds : run.recommendedDepartmentIds
        if (ids?.length) {
          put(state.tickets, assign(updated, [...new Set(ids)], actor))
          audit("TICKET", ticket.id, "REVIEW_REEVALUATION", { resolution: action.resolution, run: run.id })
          return done(ticket.id)
        }
      }
      put(state.tickets, updated)
      audit("TICKET", ticket.id, "REVIEW_REEVALUATION", { resolution: action.resolution, run: run.id })
    }
  }
  return done(ticket.id)
}
