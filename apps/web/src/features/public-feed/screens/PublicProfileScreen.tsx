"use client";

import { BackButton } from "@/components/shared/BackButton";
import { CampusHeading } from "@/components/shared/CampusHeading";
import { UserRound } from "lucide-react";
import { publicFeedPath } from "@/features/auth";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageFrame } from "@/components/shared/Controls";
import { ReportPreview } from "@/features/reports";
import { usePrototype } from "@/lib/store/PrototypeStore";

export default function PublicProfileScreen({ username }: { username: string }) {
  const { state } = usePrototype();
  const person = state?.users.find(
    (item) => item.username.toLowerCase() === username.toLowerCase(),
  );
  if (!state || !person)
    return (
      <PageFrame>
        <BackButton href={publicFeedPath} label="กลับรายการปัญหา" />
        <EmptyState title="ไม่พบโปรไฟล์สาธารณะนี้" />
      </PageFrame>
    );
  const reports = state.reports.filter(
    (item) => item.status === "CONFIRMED" && item.reporterId === person.id,
  );
  return (
    <PageFrame>
      <BackButton
        href={publicFeedPath}
        label="กลับรายการปัญหา"
        breadcrumb={{ parent: "รายการปัญหา", current: `@${person.username}` }}
      />
      <CampusHeading title={`@${person.username}`} context="โปรไฟล์สาธารณะ" icon={UserRound} />
      <h2>รายงานที่ยืนยันแล้ว ({reports.length})</h2>
      {reports.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {reports.map((report) => (
            <ReportPreview report={report} username={person.username} key={report.id} />
          ))}
        </div>
      ) : (
        <EmptyState title="ยังไม่มีรายงานสาธารณะ" />
      )}
    </PageFrame>
  );
}
