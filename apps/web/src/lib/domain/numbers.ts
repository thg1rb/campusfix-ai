export type NumberKind = "RPT" | "TKT"
export type NumberSequences = Record<NumberKind, Record<string, number>>

const bangkokCalendar = new Intl.DateTimeFormat("en", {
  timeZone: "Asia/Bangkok", calendar: "gregory", numberingSystem: "latn", year: "numeric",
})

export function bangkokYear(instant: string) {
  return bangkokCalendar.format(new Date(instant)).padStart(4, "0")
}

export function formatNumber(kind: NumberKind, year: string, value: number) {
  if (!/^\d{4}$/.test(year) || !Number.isSafeInteger(value) || value < 1) throw new RangeError("Invalid record sequence")
  return `${kind}-${year}-${String(value).padStart(5, "0")}`
}

export function reserveNumber(sequences: NumberSequences, kind: NumberKind, year: string, value: number) {
  sequences[kind][year] = Math.max(sequences[kind][year] ?? 0, value)
}

export function issueNumber(sequences: NumberSequences, kind: NumberKind, instant: string) {
  const year = bangkokYear(instant)
  const value = (sequences[kind][year] ?? 0) + 1
  const number = formatNumber(kind, year, value)
  sequences[kind][year] = value
  return number
}
