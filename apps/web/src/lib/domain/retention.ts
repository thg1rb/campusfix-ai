import type { Report } from "../../types/domain"

const retentionMs = 30 * 86400 * 1000

export function expiredReports(reports: Report[], now = Date.now()) {
  return reports.filter(report => {
    const date = report.status === "DRAFT" ? report.createdAt :
      report.status === "CANCELLED" ? report.cancelledAt : null
    return date !== null && now - Date.parse(date) >= retentionMs
  })
}
