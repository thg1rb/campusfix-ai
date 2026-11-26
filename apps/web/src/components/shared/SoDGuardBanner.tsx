import { LockKeyhole } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

export function SoDGuardBanner({ reason = "ไม่สามารถดำเนินการได้ เนื่องจากคุณเป็นผู้แจ้งรายงานในเรื่องนี้ (Separation of Duties)" }: { reason?: string }) {
  return <Alert className="bg-muted"><LockKeyhole aria-hidden="true" /><AlertTitle>จำกัดสิทธิ์ดำเนินการ</AlertTitle><AlertDescription>{reason}</AlertDescription></Alert>
}
