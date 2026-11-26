import type { Report, ReportImage, ReportLocation, Severity, User } from "../../types/domain"

export class DomainError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = "DomainError"
  }
}

export function requireRule(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new DomainError(code, message)
}

const severities: readonly Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"]

export function isSeverity(value: unknown): value is Severity {
  return severities.some(severity => severity === value)
}

export function sameDepartmentSelection(first: readonly string[], second: readonly string[]) {
  const ids = new Set(first)
  const otherIds = new Set(second)
  return ids.size === otherIds.size && [...ids].every(id => otherIds.has(id))
}

export const campusBounds = { south: 13.839, north: 13.858, west: 100.557, east: 100.580 }

export function inCampus(point: { lat: number; lng: number }) {
  return point.lat >= campusBounds.south && point.lat <= campusBounds.north &&
    point.lng >= campusBounds.west && point.lng <= campusBounds.east
}

export function validLocation(location: ReportLocation | null): location is ReportLocation {
  return !!location?.locationName.trim() && inCampus(location)
}

export function imageError(image: Pick<ReportImage, "fileName" | "mimeType" | "sizeBytes">) {
  const mime = image.fileName.toLowerCase().match(/\.png$/) ? "image/png" :
    image.fileName.toLowerCase().match(/\.jpe?g$/) ? "image/jpeg" : null
  if (!mime || image.mimeType !== mime) return "รองรับเฉพาะไฟล์ .png, .jpg และ .jpeg"
  if (!Number.isFinite(image.sizeBytes) || image.sizeBytes <= 0 || image.sizeBytes > 10 * 1024 * 1024) {
    return "รูปภาพต้องมีขนาดไม่เกิน 10 MB ต่อไฟล์"
  }
}

export type ReportFields = Pick<Report, "description" | "images" | "location">

export function reportErrors({ description, images, location }: ReportFields, draft = false) {
  return {
    description: !draft && !description.trim() ? "กรุณากรอกรายละเอียดปัญหา" : undefined,
    images: images.length > 5 || (!draft && images.length === 0)
      ? "กรุณาแนบรูปภาพ 1–5 ภาพ"
      : images.map(imageError).find(Boolean),
    location: !draft && !validLocation(location)
      ? "กรุณาระบุสถานที่และปักหมุดภายในวิทยาเขตบางเขน" : undefined,
  }
}

export function validateReport(fields: ReportFields, draft = false) {
  const error = Object.values(reportErrors(fields, draft)).find(Boolean)
  requireRule(!error, "INVALID_REPORT", error ?? "")
}

export function usernameError(username: string, users: User[], selfId: string) {
  if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) return "ใช้ตัวอักษรอังกฤษ ตัวเลข หรือขีดล่าง 3–30 ตัว"
  if (users.some(user => user.id !== selfId && user.username.toLowerCase() === username.toLowerCase())) {
    return "ชื่อผู้ใช้นี้ถูกใช้แล้ว"
  }
}

export function isUniversityEmail(email: string) {
  return /^[^@\s]+@ku\.th$/i.test(email)
}

export function isEligibleGoogleAccount(user: User) {
  return user.authProvider === "GOOGLE" && typeof user.providerSubjectId === "string" && !!user.providerSubjectId.trim() &&
    user.hostedDomain === "ku.th" && user.emailVerified === true && isUniversityEmail(user.email)
}

export function requiredText(value: string, message = "กรุณากรอกเหตุผล") {
  const trimmed = value.trim()
  requireRule(trimmed, "REQUIRED_TEXT", message)
  return trimmed
}
