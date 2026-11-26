import type { PrototypeState } from "../../data/seed"
import { majorEmailEventTypes, publicActivityTypes, type Ticket } from "../../types/domain"
import { isActiveTicket, isFinalTicket } from "../domain/permissions"

function isTicketStatus(status: unknown): status is Ticket["status"] {
  return isActiveTicket(status) || isFinalTicket(status)
}

export function migrateTicketLifecycle(saved: PrototypeState): PrototypeState {
  // Select current fields explicitly so obsolete fields are dropped even from valid tickets.
  const tickets = saved.tickets.map(({
    id, ticketNumber, title, summary, status, categoryId, severity, location, departments, confirmedBy,
    confirmedAt, resolvedAt, resolutionSummary, pendingReevaluation, updatedAt,
  }): Ticket => ({
    id, ticketNumber, title, summary, status: isTicketStatus(status) ? status : "CONFIRMED",
    categoryId, severity, location, departments, confirmedBy, confirmedAt,
    resolvedAt, resolutionSummary, pendingReevaluation, updatedAt,
  }))
  return {
    ...saved,
    tickets,
    publicActivities: saved.publicActivities.filter(event => publicActivityTypes.includes(event.type) &&
      (event.oldStatus === null || isTicketStatus(event.oldStatus)) &&
      (event.newStatus === null || isTicketStatus(event.newStatus))),
    emailLogs: saved.emailLogs.filter(email => majorEmailEventTypes.includes(email.eventType)),
    auditLogs: saved.auditLogs.filter(log => !(log.entityType === "TICKET" && log.action === "CHANGE_STATUS") ||
      (isTicketStatus(log.details.from) && isTicketStatus(log.details.to))),
  }
}
