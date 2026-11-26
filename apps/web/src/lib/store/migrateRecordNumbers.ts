import type { PrototypeState } from "../../data/seed"
import { bangkokYear, formatNumber, issueNumber, reserveNumber, type NumberKind, type NumberSequences } from "../domain/numbers"

function legacyNumber(id: string) {
  const match = /^(RPT|CF)-(\d{4})-(\d+)$/.exec(id)
  if (!match || !Number.isSafeInteger(Number(match[3])) || Number(match[3]) < 1) return
  return { kind: (match[1] === "RPT" ? "RPT" : "TKT") as NumberKind, year: match[2], sequence: Number(match[3]) }
}

export function migrateRecordNumbers(saved: PrototypeState): PrototypeState {
  if (saved.numberSequences) return saved
  const numberSequences: NumberSequences = { RPT: {}, TKT: {} }
  const ids = new Map<string, string>()
  const numbers = new Map<string, string>()
  const legacyIds = [...saved.reports, ...saved.tickets].map(row => row.id)
    .concat(saved.auditLogs.map(log => log.entityId))
  for (const id of legacyIds) {
    const parts = legacyNumber(id)
    if (!parts) continue
    reserveNumber(numberSequences, parts.kind, parts.year, parts.sequence)
    ids.set(id, ids.get(id) ?? crypto.randomUUID())
    numbers.set(id, formatNumber(parts.kind, parts.year, parts.sequence))
  }

  const internal = (id: string) => ids.get(id) ?? id
  const linked = (id: string | null) => id === null ? null : internal(id)
  function assign(id: string, kind: NumberKind, instant: string) {
    const previous = legacyNumber(id)
    const number = previous?.kind === kind && previous.year === bangkokYear(instant)
      ? formatNumber(kind, previous.year, previous.sequence) : issueNumber(numberSequences, kind, instant)
    numbers.set(id, number)
    return number
  }
  const reports = saved.reports.map(report => ({
    ...report, id: internal(report.id),
    reportNumber: report.status === "DRAFT" ? null : assign(report.id, "RPT", report.submittedAt ?? report.createdAt),
    ticketId: linked(report.ticketId), requestedTargetTicketId: linked(report.requestedTargetTicketId),
  }))
  const tickets = saved.tickets.map(ticket => ({
    ...ticket, id: internal(ticket.id), ticketNumber: assign(ticket.id, "TKT", ticket.confirmedAt),
    pendingReevaluation: ticket.pendingReevaluation && {
      ...ticket.pendingReevaluation, ticketId: internal(ticket.id),
      triggeredByReportId: internal(ticket.pendingReevaluation.triggeredByReportId),
    },
  }))
  // Generated run IDs also contain the old report ID.
  const rewriteRunId = (id: string) => id.replace(/^(ai-|reeval-)(RPT-\d{4}-\d+)(-\d+)$/, (_, prefix: string, reportId: string, suffix: string) =>
    prefix + internal(reportId) + suffix)
  for (const ticket of tickets) {
    if (ticket.pendingReevaluation) ticket.pendingReevaluation.id = rewriteRunId(ticket.pendingReevaluation.id)
  }
  function rewriteDetails(value: unknown): unknown {
    if (typeof value === "string") return ids.get(value) ?? rewriteRunId(value)
    if (Array.isArray(value)) return value.map(rewriteDetails)
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, rewriteDetails(entry)]))
    }
    return value
  }
  const ticketLinks = <T extends { ticketId: string }>(rows: T[]) =>
    rows.map(row => ({ ...row, ticketId: internal(row.ticketId) }))

  return {
    ...saved, numberSequences, reports, tickets,
    affected: ticketLinks(saved.affected),
    threadMessages: ticketLinks(saved.threadMessages),
    feedbacks: ticketLinks(saved.feedbacks),
    publicActivities: ticketLinks(saved.publicActivities),
    aiRuns: saved.aiRuns.map(run => ({
      ...run, id: rewriteRunId(run.id), reportId: internal(run.reportId), candidateTicketId: linked(run.candidateTicketId),
      similarCandidates: run.similarCandidates?.map(candidate => ({ ...candidate, ticketId: internal(candidate.ticketId) })),
    })),
    emailLogs: saved.emailLogs.map(email => ({
      ...email, ticketId: internal(email.ticketId), reportId: linked(email.reportId),
      subject: email.subject.replace(/\bCF-\d{4}-\d+\b/g, id => numbers.get(id) ?? id),
    })),
    auditLogs: saved.auditLogs.map(log => ({
      ...log, entityId: internal(rewriteRunId(log.entityId)),
      details: {
        ...(rewriteDetails(log.details) as Record<string, unknown>),
        ...(numbers.has(log.entityId) && {
          [legacyNumber(log.entityId)?.kind === "RPT" ? "reportNumber" : "ticketNumber"]: numbers.get(log.entityId),
        }),
        ...(typeof log.details.ticketId === "string" && numbers.has(log.details.ticketId) &&
          { ticketNumber: numbers.get(log.details.ticketId) }),
      },
    })),
  }
}
