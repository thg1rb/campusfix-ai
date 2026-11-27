"use client";

import Link from "next/link";
import { BackButton } from "@/components/shared/BackButton";
import { CampusHeading } from "@/components/shared/CampusHeading";
import { BarChart3 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AccessNotice, PageFrame } from "@/components/shared/Controls";
import { MetricGrid } from "@/components/shared/Metrics";
import { StatusBadge } from "@/components/shared/Badges";
import { aggregateFeedback, feedbackDimensions, summarize } from "@/lib/domain/analytics";
import { isExclusiveAdmin } from "@/lib/domain/permissions";
import { formatDuration } from "@/lib/format";
import { usePrototype } from "@/lib/store/PrototypeStore";

export default function DepartmentAnalyticsScreen() {
  const { state, user } = usePrototype();
  if (
    !state ||
    !user?.roles.includes("DEPARTMENT_STAFF") ||
    !user.departmentId ||
    isExclusiveAdmin(user)
  )
    return <AccessNotice loggedIn={!!user} path="/department/analytics" />;
  const name = state.departments.find((item) => item.id === user.departmentId)?.name;
  const tickets = state.tickets.filter((item) =>
    item.departments.some((dept) => dept.departmentId === user.departmentId),
  );
  const ids = new Set(tickets.map((item) => item.id));
  const stats = summarize(
    tickets,
    state.reports.filter((item) => item.ticketId && ids.has(item.ticketId)),
    state.affected,
  );
  const feedback = aggregateFeedback(state.feedbacks.filter((item) => ids.has(item.ticketId)));
  return (
    <PageFrame>
      <BackButton
        href="/department"
        label="กลับรายการงานของหน่วยงาน"
        breadcrumb={{ parent: "งานหน่วยงาน", current: "สถิติผลการดำเนินงาน" }}
      />
      <CampusHeading title="สถิติผลการดำเนินงานหน่วยงาน" context={name} icon={BarChart3} />
      <MetricGrid
        metrics={[
          { label: "เรื่องที่รับผิดชอบ", value: stats.ticketCount },
          { label: "เรื่องที่เปิดอยู่", value: stats.activeCount },
          { label: "แก้ไขเสร็จแล้ว", value: stats.resolvedCount },
          { label: "รายงานที่ยืนยันแล้ว", value: stats.reportCount },
          { label: "ผู้ได้รับผลกระทบ", value: stats.affectedUserCount },
          { label: "เวลาแก้ไขเฉลี่ย", value: formatDuration(stats.resolutionTime) },
          { label: "ความพึงพอใจเฉลี่ย", value: feedback.average?.toFixed(1) ?? "—" },
        ]}
      />
      <section className="grid gap-3 rounded-lg border bg-card p-4">
        <h2>คะแนนประเมินแยกตามด้าน</h2>
        <dl className="grid gap-2">
          {feedback.dimensions.map(({ key, average }) => (
            <div key={key} className="flex flex-wrap justify-between gap-2">
              <dt>{feedbackDimensions[key]}</dt>
              <dd>{average?.toFixed(1) ?? "—"} / 5.0</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="min-w-0 rounded-lg border bg-card p-4">
        <h2 className="mb-2">รายการเรื่องที่รับผิดชอบ</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>เรื่อง</TableHead>
              <TableHead>สถานะ</TableHead>
              <TableHead>รายงานที่ยืนยัน</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tickets.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <Link
                    className="inline-flex min-h-11 items-center hover:underline"
                    href={`/department/tickets/${item.ticketNumber}`}
                  >
                    {item.ticketNumber}
                  </Link>
                </TableCell>
                <TableCell>
                  <StatusBadge status={item.status} />
                </TableCell>
                <TableCell>
                  {
                    state.reports.filter(
                      (report) => report.ticketId === item.id && report.status === "CONFIRMED",
                    ).length
                  }
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </PageFrame>
  );
}
