"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { FilePlus2 } from "lucide-react";
import { CampusHeading } from "@/components/shared/CampusHeading";
import { reportCampus, reportRoutingHint } from "../components/ReportFormGuidance";
import { PageFrame } from "@/components/shared/Controls";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import { getReport } from "@/lib/api/reports";
import { useApiResource } from "@/lib/api/useApiResource";
import { usePrototype } from "@/lib/store/PrototypeStore";
import type { Report } from "@/types/domain";
import { ReportForm } from "../components/ReportForm";
import { ReporterAccess, ReportLoading, ReportLoadError } from "../components/ReporterAccess";
import { asReport } from "../liveReport";

function DraftUnavailable() {
  return (
    <PageFrame>
      <EmptyState title="ไม่พบฉบับร่างที่แก้ไขได้" />
    </PageFrame>
  );
}

function CreateForm({
  draft,
  targetId,
  live,
}: {
  draft?: Report;
  targetId?: string;
  live?: boolean;
}) {
  return (
    <PageFrame>
      <CampusHeading
        title={draft ? "แก้ไขฉบับร่าง" : "แจ้งปัญหาใหม่"}
        context={reportCampus}
        subtitle={reportRoutingHint}
        icon={FilePlus2}
      />
      <ReportForm existing={draft} targetId={targetId} live={live} />
    </PageFrame>
  );
}

function DemoCreateForm({ draftId, targetId }: { draftId?: string; targetId?: string }) {
  const { state, user } = usePrototype();
  const [draft] = useState(() =>
    state?.reports.find(
      (item) => item.id === draftId && item.status === "DRAFT" && item.reporterId === user?.id,
    ),
  );
  return draftId && !draft ? (
    <DraftUnavailable />
  ) : (
    <CreateForm draft={draft} targetId={targetId} />
  );
}

function LiveDraftForm({ draftId, userId }: { draftId: string; userId: string }) {
  const load = useCallback((signal: AbortSignal) => getReport(draftId, signal), [draftId]);
  const { result, reload } = useApiResource(load);
  if (result.status === "loading") return <ReportLoading />;
  if (result.status === "error") {
    if (result.error instanceof ApiError && [400, 404].includes(result.error.status))
      return <DraftUnavailable />;
    return <ReportLoadError error={result.error} reload={reload} />;
  }
  return result.value.status === "DRAFT" && result.value.reporterId === userId ? (
    <CreateForm live draft={asReport(result.value)} />
  ) : (
    <DraftUnavailable />
  );
}

export default function CreateReportScreen({
  draftId,
  targetId,
}: {
  draftId?: string;
  targetId?: string;
}) {
  const query = targetId
    ? `?targetTicketNumber=${encodeURIComponent(targetId)}`
    : draftId
      ? `?draftId=${encodeURIComponent(draftId)}`
      : "";
  return (
    <ReporterAccess path={`/reports/new${query}`} write>
      {({ live, userId }) => {
        const key = `${userId}:${draftId ?? targetId ?? ""}`;
        if (!live) return <DemoCreateForm key={key} draftId={draftId} targetId={targetId} />;
        if (draftId) return <LiveDraftForm key={key} draftId={draftId} userId={userId} />;
        if (targetId)
          return (
            <PageFrame>
              <EmptyState title="ยังไม่สามารถส่งรายงานเพิ่มเติมจากเรื่องนี้ได้">
                <Button asChild>
                  <Link href="/reports/new">แจ้งปัญหาใหม่</Link>
                </Button>
              </EmptyState>
            </PageFrame>
          );
        return <CreateForm key={key} live />;
      }}
    </ReporterAccess>
  );
}
