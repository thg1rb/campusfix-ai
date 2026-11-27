"use client";

import { useState } from "react";
import { BarChart3, Star } from "lucide-react";
import { toast } from "sonner";
import { CampusHeading } from "@/components/shared/CampusHeading";
import { Badge } from "@/components/ui/badge";
import { matchesSearch, ResultFilters } from "@/components/shared/ResultFilters";
import { AdminTable } from "../components/AdminTable";
import { AdminBreakdowns } from "../components/AdminBreakdowns";
import { AuditLogTable } from "../components/AuditLogTable";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TableCell, TableRow } from "@/components/ui/table";
import { Choice } from "@/components/shared/Controls";
import { MetricGrid } from "@/components/shared/Metrics";
import { severityLabels, ticketStatusLabels } from "@/components/shared/Badges";
import { aggregateFeedback, summarize } from "@/lib/domain/analytics";
import { expiredReports } from "@/lib/domain/retention";
import { formatDuration } from "@/lib/format";
import { usePrototype } from "@/lib/store/PrototypeStore";

export default function AdminAnalyticsScreen() {
  const { state, dispatch } = usePrototype();
  const [period, setPeriod] = useState("all");
  const [departmentQuery, setDepartmentQuery] = useState("");
  const [now] = useState(Date.now);
  if (!state) return null;
  const cutoff = period === "all" ? 0 : now - Number(period) * 86400000;
  const tickets = state.tickets.filter((item) => Date.parse(item.confirmedAt) >= cutoff);
  const ids = new Set(tickets.map((item) => item.id));
  const reports = state.reports.filter((item) =>
    item.ticketId
      ? ids.has(item.ticketId)
      : item.status === "REJECTED" && Date.parse(item.reviewedAt ?? "") >= cutoff,
  );
  const confirmed = reports.filter((item) => item.status === "CONFIRMED");
  const stats = summarize(tickets, reports, state.affected, now);
  const expired = expiredReports(state.reports, now);
  const categoryByTicket = new Map(tickets.map((ticket) => [ticket.id, ticket.categoryId]));
  const rowsByCategory = state.categories.map((category) => ({
    id: category.id,
    label: category.name,
    count: tickets.filter((ticket) => ticket.categoryId === category.id).length,
    reports: confirmed.filter(
      (report) => categoryByTicket.get(report.ticketId ?? "") === category.id,
    ).length,
  }));
  const rowsByLocation = [
    ...state.locations.map((location) => ({
      id: location.id,
      label: location.name,
      count: confirmed.filter((report) => report.location?.locationId === location.id).length,
    })),
    {
      id: "unlisted",
      label: "จุดปักหมุดอื่นในวิทยาเขต",
      count: confirmed.filter((report) => !report.location?.locationId).length,
    },
  ].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "th"));
  const departments = state.departments.filter((item) =>
    matchesSearch(departmentQuery, item.name, item.responsibilityScope),
  );
  return (
    <>
      <CampusHeading
        icon={BarChart3}
        title="ภาพรวมระบบ"
        context="ข้อมูลจำลอง · มหาวิทยาลัยเกษตรศาสตร์ วิทยาเขตบางเขน"
        stats={[
          { label: "เรื่องในช่วงเวลาที่เลือก", value: stats.ticketCount },
          { label: "รายงานยืนยันแล้ว", value: stats.reportCount },
          { label: "ผู้ได้รับผลกระทบ", value: stats.affectedUserCount },
        ]}
      />
      <Tabs defaultValue="overview">
        <TabsList aria-label="มุมมองผู้ดูแลระบบ">
          <TabsTrigger value="overview">ภาพรวม</TabsTrigger>
          <TabsTrigger value="audit">ประวัติการเปลี่ยนแปลง</TabsTrigger>
          <TabsTrigger value="retention">การเก็บข้อมูล</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="grid min-w-0 gap-4">
          <div className="campus-panel min-w-0 p-3 sm:max-w-sm sm:p-4">
            <Choice
              label="ช่วงเวลาที่ยืนยันเรื่อง"
              value={period}
              onChange={setPeriod}
              options={[
                { value: "all", label: "ทั้งหมด" },
                { value: "7", label: "7 วันที่ผ่านมา" },
                { value: "30", label: "30 วันที่ผ่านมา" },
              ]}
            />
          </div>
          <MetricGrid
            metrics={[
              { label: "จำนวนเรื่องทั้งหมด", value: stats.ticketCount },
              { label: "เรื่องที่เปิดอยู่", value: stats.activeCount },
              { label: "แก้ไขเสร็จแล้ว", value: stats.resolvedCount },
              { label: "จำนวนรายงานที่ยืนยัน", value: stats.reportCount },
              { label: "จำนวนผู้ได้รับผลกระทบ", value: stats.affectedUserCount },
            ]}
          />
          <section className="grid gap-3">
            <h2>ระยะเวลาเฉลี่ย</h2>
            <MetricGrid
              metrics={[
                { label: "เวลาตรวจสอบรายงาน", value: formatDuration(stats.reviewTime) },
                { label: "เวลาแก้ไขหลังยืนยัน", value: formatDuration(stats.resolutionTime) },
                { label: "เวลารวมตั้งแต่แจ้งถึงแก้ไข", value: formatDuration(stats.totalLeadTime) },
                { label: "อายุเรื่องที่เปิดอยู่", value: formatDuration(stats.aging) },
              ]}
            />
          </section>
          <AdminBreakdowns
            statuses={Object.entries(ticketStatusLabels).map(([id, label]) => ({
              id,
              label,
              count: tickets.filter((item) => item.status === id).length,
            }))}
            categories={rowsByCategory}
            severities={Object.entries(severityLabels).map(([id, label]) => ({
              id,
              label,
              count: tickets.filter((item) => item.severity === id).length,
            }))}
            locations={rowsByLocation}
          />
          <section className="grid min-w-0 gap-3">
            <h2>ผลการดำเนินงานแยกตามหน่วยงาน</h2>
            <ResultFilters
              label="ค้นหาหน่วยงาน"
              placeholder="ค้นหาชื่อหรือขอบเขตงาน…"
              query={departmentQuery}
              onQuery={setDepartmentQuery}
              onClear={() => setDepartmentQuery("")}
            >
              {null}
            </ResultFilters>
            <AdminTable
              label="ผลการดำเนินงานแยกตามหน่วยงาน"
              headings={[
                "หน่วยงาน",
                "เรื่อง",
                "เสร็จแล้ว",
                "เปิดอยู่",
                "เวลาแก้ไขเฉลี่ย",
                "ความพึงพอใจ",
                "รายงาน",
              ]}
              empty={!departments.length ? "ไม่พบหน่วยงานที่ตรงกับตัวกรอง" : undefined}
            >
              {departments.map((department) => {
                const selected = tickets.filter((ticket) =>
                  ticket.departments.some((item) => item.departmentId === department.id),
                );
                const selectedIds = new Set(selected.map((item) => item.id));
                const details = summarize(selected, confirmed, state.affected, now);
                const feedback = aggregateFeedback(
                  state.feedbacks.filter((row) => selectedIds.has(row.ticketId)),
                );
                return (
                  <TableRow key={department.id}>
                    <TableCell className="min-w-36 whitespace-normal font-medium">
                      {department.name}
                    </TableCell>
                    <TableCell className="tabular-nums">{details.ticketCount}</TableCell>
                    <TableCell className="tabular-nums">{details.resolvedCount}</TableCell>
                    <TableCell className="tabular-nums">{details.activeCount}</TableCell>
                    <TableCell className="tabular-nums">
                      {formatDuration(details.resolutionTime)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" data-tone="warning" className="tabular-nums">
                        <Star aria-hidden="true" />
                        {feedback.average?.toFixed(1) ?? "—"}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">{details.reportCount}</TableCell>
                  </TableRow>
                );
              })}
            </AdminTable>
          </section>
        </TabsContent>
        <TabsContent value="audit" className="min-w-0">
          <AuditLogTable state={state} />
        </TabsContent>
        <TabsContent value="retention" className="grid gap-3 rounded-lg border bg-card p-4">
          <h2>รายงานที่เก็บครบ 30 วัน</h2>
          <p>
            ฉบับร่าง {expired.filter((item) => item.status === "DRAFT").length} รายงาน · ยกเลิกแล้ว{" "}
            {expired.filter((item) => item.status === "CANCELLED").length} รายงาน
          </p>
          <Button
            variant="outline"
            className="justify-self-start"
            onClick={async () => {
              const result = await dispatch({ type: "purge" });
              if (result.ok) toast.success(`ล้างข้อมูลครบ 30 วันแล้ว ${result.data} รายงาน`);
              else toast.error(result.message);
            }}
          >
            ล้างข้อมูลครบ 30 วัน
          </Button>
        </TabsContent>
      </Tabs>
    </>
  );
}
