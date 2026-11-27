"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { Choice, labelOptions } from "@/components/shared/Controls";
import { PaginationBar } from "@/components/shared/PaginationBar";
import { allResults, matchesSearch, ResultFilters } from "@/components/shared/ResultFilters";
import { usePagination } from "@/hooks/usePagination";
import { roleLabels } from "@/features/auth";
import { formatThaiDateTime } from "@/lib/format";
import type { PrototypeState } from "@/data/seed";
import type { AuditLogEntry } from "@/types/domain";
import { AdminTable } from "./AdminTable";

const entityLabels: Record<AuditLogEntry["entityType"], string> = {
  REPORT: "รายงาน",
  TICKET: "เรื่อง",
  AI_RUN: "ผลวิเคราะห์ AI",
  USER: "ผู้ใช้",
  CATEGORY: "ประเภทปัญหา",
  DEPARTMENT: "หน่วยงาน",
  LOCATION: "สถานที่",
  RETENTION: "การเก็บข้อมูล",
};
const actionLabels: Record<string, string> = {
  AUTO_RESOLVED: "ปิดเรื่องอัตโนมัติ",
  ANALYZE_REPORT: "วิเคราะห์รายงาน",
  REEVALUATE_TICKET: "วิเคราะห์เรื่องซ้ำ",
  CHANGE_DEPARTMENTS: "เปลี่ยนหน่วยงาน",
  PURGE_REPORT: "ล้างรายงานครบกำหนด",
  CHANGE_USERNAME: "เปลี่ยนชื่อผู้ใช้",
  MANAGE_USER: "จัดการสิทธิ์ผู้ใช้",
  SAVE_MASTER_DATA: "บันทึกข้อมูลระบบ",
  SAVE_DRAFT: "บันทึกฉบับร่าง",
  EDIT_PENDING: "แก้ไขรายงานที่รอตรวจสอบ",
  SUBMIT: "ส่งรายงาน",
  CANCEL: "ยกเลิกรายงาน",
  CORRECT_CONFIRMED: "แก้ไขรายงานที่ยืนยันแล้ว",
  REJECT: "ปฏิเสธรายงาน",
  CONFIRM: "ยืนยันรายงาน",
  CHANGE_STATUS: "เปลี่ยนสถานะ",
  RECORD_ACTION: "บันทึกการดำเนินงาน",
  DEPARTMENT_COMPLETED: "ยืนยันงานหน่วยงานเสร็จสิ้น",
  REVIEW_REEVALUATION: "ทบทวนผลวิเคราะห์",
};

export function AuditLogTable({ state }: { state: PrototypeState }) {
  const [query, setQuery] = useState("");
  const [entity, setEntity] = useState("all");
  const pager = usePagination();
  const users = new Map(state.users.map((user) => [user.id, `@${user.username}`]));
  const departments = new Map(state.departments.map((item) => [item.id, item.name]));
  const actorName = (id: string) =>
    users.get(id) ?? (id === "SYSTEM" ? "ระบบ" : id === "AI_SERVICE" ? "AI จำลอง" : id);
  const publicNumbers = new Map([
    ...state.tickets.map((ticket) => [ticket.id, ticket.ticketNumber] as const),
    ...state.reports.map((report) => [report.id, report.reportNumber] as const),
  ]);
  const recordLabel = (log: PrototypeState["auditLogs"][number]) =>
    String(
      log.details.reportNumber ??
        log.details.ticketNumber ??
        publicNumbers.get(log.entityId) ??
        log.entityId,
    );
  const page = pager.current(
    state.auditLogs.filter(
      (log) =>
        (entity === "all" || log.entityType === entity) &&
        matchesSearch(
          query,
          recordLabel(log),
          log.details.ticketNumber as string | undefined,
          log.action,
          actionLabels[log.action],
          actorName(log.actorId),
          departments.get(log.departmentId ?? ""),
          log.entityType,
          entityLabels[log.entityType],
        ),
    ),
  );
  return (
    <section className="grid min-w-0 gap-4">
      <h2>ประวัติการเปลี่ยนแปลง</h2>
      <ResultFilters
        label="ค้นหาประวัติ"
        placeholder="ค้นหาเลขรายการ การดำเนินการ หรือผู้ใช้…"
        query={query}
        onQuery={(value) => {
          setQuery(value);
          pager.reset();
        }}
        onClear={() => {
          setQuery("");
          setEntity("all");
          pager.reset();
        }}
      >
        <div className="w-full sm:w-52">
          <Choice
            label="ประเภทรายการ"
            value={entity}
            options={[allResults, ...labelOptions(entityLabels)]}
            onChange={(value) => {
              setEntity(value);
              pager.reset();
            }}
          />
        </div>
      </ResultFilters>
      <AdminTable
        label="ประวัติการเปลี่ยนแปลง"
        headings={["เวลา", "รายการ", "การดำเนินการ", "ผู้ดำเนินการ", "รายละเอียด"]}
        empty={
          !page.items.length
            ? state.auditLogs.length
              ? "ไม่พบประวัติที่ตรงกับตัวกรอง"
              : "ยังไม่มีประวัติการเปลี่ยนแปลงในรอบการทดลองนี้"
            : undefined
        }
      >
        {page.items.map((log) => (
          <TableRow key={log.id}>
            <TableCell className="tabular-nums">{formatThaiDateTime(log.createdAt)}</TableCell>
            <TableCell>
              <div className="grid gap-1">
                <Badge variant="outline" data-tone="info">
                  {entityLabels[log.entityType]}
                </Badge>
                <span>{recordLabel(log)}</span>
              </div>
            </TableCell>
            <TableCell className="whitespace-normal">
              <Badge
                variant="outline"
                data-tone="indigo"
                className="max-w-full whitespace-normal"
                title={log.action}
              >
                {actionLabels[log.action] ?? log.action}
              </Badge>
            </TableCell>
            <TableCell>
              <div className="grid gap-1">
                <span className="font-medium">{actorName(log.actorId)}</span>
                <span className="text-xs text-muted-foreground">
                  {log.actorRoles
                    .map((role) =>
                      role === "SYSTEM"
                        ? "ระบบ"
                        : role === "AI_SERVICE"
                          ? "AI จำลอง"
                          : roleLabels[role],
                    )
                    .join(", ")}
                </span>
                {log.departmentId && (
                  <span className="text-xs text-muted-foreground">
                    {departments.get(log.departmentId) ?? log.departmentId}
                  </span>
                )}
              </div>
            </TableCell>
            <TableCell>
              <details>
                <summary className="min-h-11 min-w-11 cursor-pointer py-2 text-primary">
                  ดูข้อมูล
                </summary>
                <pre className="w-48 whitespace-pre-wrap break-all text-xs md:w-64">
                  {JSON.stringify(log.details, null, 2)}
                </pre>
              </details>
            </TableCell>
          </TableRow>
        ))}
      </AdminTable>
      <PaginationBar {...page.controls} />
    </section>
  );
}
