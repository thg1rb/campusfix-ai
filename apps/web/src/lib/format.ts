const thaiDate = new Intl.DateTimeFormat("th-TH-u-ca-buddhist-nu-latn", {
  timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "numeric",
})
const thaiTime = new Intl.DateTimeFormat("th-TH-u-nu-latn", {
  timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
})

export function formatThaiDateTime(iso: string | null) {
  if (!iso) return "—"
  const date = new Date(iso)
  return `${thaiDate.format(date)}, ${thaiTime.format(date)} น.`
}

export function formatDuration(milliseconds: number | null) {
  if (milliseconds === null) return "—"
  const minutes = Math.max(0, Math.floor(milliseconds / 60000))
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (days) return `${days} วัน ${hours % 24} ชม.`
  if (hours) return `${hours} ชม. ${minutes % 60} นาที`
  return `${minutes} นาที`
}

const fileSizeNumber = new Intl.NumberFormat("th-TH-u-nu-latn", { maximumFractionDigits: 2 })

export function formatFileSize(sizeBytes: number) {
  if (sizeBytes >= 1024 ** 2) return `${fileSizeNumber.format(sizeBytes / 1024 ** 2)} MB`
  if (sizeBytes >= 1024) return `${fileSizeNumber.format(sizeBytes / 1024)} KB`
  return `${fileSizeNumber.format(sizeBytes)} B`
}
