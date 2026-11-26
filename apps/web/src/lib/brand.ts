export const platformName = "KU Spot"
export const platformTagline = "AI-Assisted Campus Issue Management Platform"

const emailPrefix = `[${platformName}] `

export function brandEmailSubject(subject: string) {
  return subject.startsWith(emailPrefix) ? subject : emailPrefix + subject
}
