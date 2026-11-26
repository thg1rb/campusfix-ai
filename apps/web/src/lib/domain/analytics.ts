import type { FeedbackDimensionKey, FeedbackSubmission, Report, Ticket, TicketAffected } from "../../types/domain"
import { isActiveTicket } from "./permissions"

export const feedbackDimensions: Record<FeedbackDimensionKey, string> = {
  speed: "ความรวดเร็วในการดำเนินการ", quality: "คุณภาพและความเรียบร้อยของการแก้ไข",
  communication: "ความชัดเจนในการสื่อสารและอัปเดตสถานะ", overall: "ความพึงพอใจโดยรวม",
}
export const feedbackKeys = Object.keys(feedbackDimensions) as FeedbackDimensionKey[]

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
}

export function aggregateFeedback(submissions: FeedbackSubmission[]) {
  const dimensions = feedbackKeys.map(key => ({ key, average: mean(submissions.map(item => item.ratings[key])) }))
  return { count: submissions.length, dimensions, average: mean(submissions.flatMap(item => feedbackKeys.map(key => item.ratings[key]))) }
}

export function summarize(tickets: Ticket[], reports: Report[], affected: TicketAffected[], now = Date.now()) {
  const ids = new Set(tickets.map(ticket => ticket.id))
  const confirmed = reports.filter(report => report.status === "CONFIRMED" && report.ticketId && ids.has(report.ticketId))
  const active = tickets.filter(ticket => isActiveTicket(ticket.status))
  const resolved = tickets.filter(ticket => ticket.status === "RESOLVED")
  const since = (start: string | null, end: string | null) => start && end ? [Date.parse(end) - Date.parse(start)] : []
  return {
    ticketCount: tickets.length, reportCount: confirmed.length, activeCount: active.length, resolvedCount: resolved.length,
    affectedUserCount: affected.filter(item => ids.has(item.ticketId)).length,
    reviewTime: mean([...confirmed, ...reports.filter(report => report.status === "REJECTED")]
      .flatMap(report => since(report.submittedAt, report.reviewedAt))),
    resolutionTime: mean(resolved.flatMap(ticket => since(ticket.confirmedAt, ticket.resolvedAt))),
    totalLeadTime: mean(resolved.flatMap(ticket => {
      const earliest = confirmed.filter(report => report.ticketId === ticket.id && report.submittedAt)
        .map(report => report.submittedAt!).sort()[0]
      return since(earliest ?? null, ticket.resolvedAt)
    })),
    aging: mean(active.map(ticket => now - Date.parse(ticket.confirmedAt))),
  }
}
