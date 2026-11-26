import Link from "next/link"
import Image from "next/image"
import { Card, CardContent } from "@/components/ui/card"
import { formatThaiDateTime } from "@/lib/format"
import type { Report } from "@/types/domain"

export function ReportPreview({ report, username }: { report: Report; username?: string }) {
  const image = report.images[0]
  return <Card className="min-w-0 gap-0 border py-0 ring-0">
    <CardContent className="flex items-center gap-3 p-3">
      {image && <Image unoptimized src={image.url} alt={image.alt} width={80} height={64} className="h-16 w-20 shrink-0 rounded-md object-cover" />}
      <div className="min-w-0">
        <Link href={`/reports/${report.reportNumber}`} className="inline-flex min-h-11 items-center font-medium hover:underline">{report.aiGeneratedTitle ?? report.reportNumber}</Link>
        <p className="text-xs text-muted-foreground">{username ? `@${username} · ` : ""}{formatThaiDateTime(report.reviewedAt)}</p>
      </div>
    </CardContent>
  </Card>
}
