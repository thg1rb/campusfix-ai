"use client";

import { useCallback, useState } from "react";
import { FilePenLine } from "lucide-react";
import { BackButton } from "@/components/shared/BackButton";
import { CampusHeading } from "@/components/shared/CampusHeading";
import { Badge } from "@/components/ui/badge";
import { reportCampus } from "../components/ReportFormGuidance";
import { PageFrame } from "@/components/shared/Controls";
import { EmptyState } from "@/components/shared/EmptyState";
import { ApiError } from "@/lib/api/client";
import { getReport, listMyReports } from "@/lib/api/reports";
import { useApiResource } from "@/lib/api/useApiResource";
import { usePrototype } from "@/lib/store/PrototypeStore";
import type { Report } from "@/types/domain";
import { ReportForm } from "../components/ReportForm";
import { ReporterAccess, ReportLoading, ReportLoadError } from "../components/ReporterAccess";
import { asReport } from "../liveReport";

function EditForm({ original, live }: { original?: Report; live?: boolean }) {
  if (!original)
    return (
      <PageFrame>
        <BackButton href="/my-reports" label="กลับรายงานของฉัน" />
        <EmptyState title="ไม่พบรายงานที่รอการตรวจสอบและแก้ไขได้" />
      </PageFrame>
    );
  return (
    <PageFrame>
      <BackButton
        href="/my-reports"
        label="กลับรายงานของฉัน"
        breadcrumb={{ parent: "รายงานของฉัน", current: `แก้ไข ${original.reportNumber}` }}
      />
      <CampusHeading
        title="แก้ไขรายงานที่รอตรวจสอบ"
        context={reportCampus}
        icon={FilePenLine}
        subtitle={
          live
            ? "ผู้ตรวจสอบจะเห็นข้อมูลรายงานเวอร์ชันล่าสุด"
            : "หลังบันทึก ระบบ AI จะวิเคราะห์ข้อมูลล่าสุดและส่งผลให้ผู้ตรวจสอบพิจารณาอีกครั้ง"
        }
      >
        <Badge variant="outline" data-tone="info" className="tabular-nums">
          {original.reportNumber} · เวอร์ชัน {original.version}
        </Badge>
      </CampusHeading>
      <ReportForm existing={original} edit live={live} />
    </PageFrame>
  );
}

function DemoEditForm({ reportNumber }: { reportNumber: string }) {
  const { state, user } = usePrototype();
  const [original] = useState(() =>
    state?.reports.find(
      (item) =>
        item.reportNumber === reportNumber &&
        item.reporterId === user?.id &&
        item.status === "PENDING_REVIEW",
    ),
  );
  return <EditForm original={original} />;
}

function LiveEditForm({ reportNumber, userId }: { reportNumber: string; userId: string }) {
  const load = useCallback(
    async (signal: AbortSignal) => {
      const page = await listMyReports({ reportNumber }, signal);
      const match = page.items.find(
        (report) => report.reportNumber === reportNumber && report.status === "PENDING_REVIEW",
      );
      return match ? getReport(match.id, signal) : null;
    },
    [reportNumber],
  );
  const { result, reload } = useApiResource(load);
  if (result.status === "loading") return <ReportLoading />;
  if (result.status === "error") {
    if (result.error instanceof ApiError && result.error.status === 404) return <EditForm />;
    return <ReportLoadError error={result.error} reload={reload} />;
  }
  const report = result.value;
  return (
    <EditForm
      live
      original={
        report?.status === "PENDING_REVIEW" && report.reporterId === userId
          ? asReport(report)
          : undefined
      }
    />
  );
}

export default function EditPendingReportScreen({ reportNumber }: { reportNumber: string }) {
  return (
    <ReporterAccess write path={`/my-reports/${encodeURIComponent(reportNumber)}/edit`}>
      {({ live, userId }) =>
        live ? (
          <LiveEditForm
            key={`${userId}:${reportNumber}`}
            reportNumber={reportNumber}
            userId={userId}
          />
        ) : (
          <DemoEditForm key={`${userId}:${reportNumber}`} reportNumber={reportNumber} />
        )
      }
    </ReporterAccess>
  );
}
