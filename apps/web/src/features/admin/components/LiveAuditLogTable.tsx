"use client";

import { useCallback, useDeferredValue, useState } from "react";
import { Choice } from "@/components/shared/Controls";
import { PaginationBar } from "@/components/shared/PaginationBar";
import { allResults, ResultFilters } from "@/components/shared/ResultFilters";
import { TableCell, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePagination } from "@/hooks/usePagination";
import { listAdminAuditLogs, type AuditEntry } from "@/lib/api/identity";
import { useApiResource } from "@/lib/api/useApiResource";
import { formatThaiDateTime } from "@/lib/format";
import { AdminRequestStatus } from "./AdminRequestStatus";
import { AdminTable } from "./AdminTable";

const entityOptions = [
  allResults,
  { value: "USER", label: "ผู้ใช้" },
  { value: "REPORT", label: "รายงาน" },
  { value: "TICKET", label: "เรื่อง" },
  { value: "AI_RUN", label: "AI" },
  { value: "CATEGORY", label: "ประเภทปัญหา" },
  { value: "DEPARTMENT", label: "หน่วยงาน" },
  { value: "LOCATION", label: "สถานที่" },
  { value: "RETENTION", label: "การเก็บข้อมูล" },
];
const uuid = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;

export function LiveAuditLogTable() {
  const [action, setAction] = useState("");
  const [entity, setEntity] = useState("all");
  const [actor, setActor] = useState("");
  const pager = usePagination();
  const deferredAction = useDeferredValue(action);
  const actorUserId = uuid.test(actor.trim()) ? actor.trim() : undefined;
  const { requestedPage, size } = pager;
  const load = useCallback(
    (signal: AbortSignal) =>
      listAdminAuditLogs(
        {
          action: deferredAction.trim().toUpperCase(),
          entityType: entity === "all" ? undefined : (entity as AuditEntry["entityType"]),
          actorUserId,
          page: requestedPage,
          pageSize: size,
        },
        signal,
      ),
    [deferredAction, entity, actorUserId, requestedPage, size],
  );
  const { result, reload } = useApiResource(load);
  return (
    <>
      <ResultFilters
        label="รหัสการดำเนินการ"
        placeholder="เช่น MANAGE_USER"
        query={action}
        onQuery={(value) => {
          setAction(value);
          pager.reset();
        }}
        onClear={() => {
          setAction("");
          setEntity("all");
          setActor("");
          pager.reset();
        }}
      >
        <Choice
          label="ประเภทข้อมูล"
          value={entity}
          options={entityOptions}
          onChange={(value) => {
            setEntity(value);
            pager.reset();
          }}
        />
        <div className="grid gap-2">
          <Label htmlFor="audit-actor">รหัสผู้ดำเนินการ</Label>
          <Input
            id="audit-actor"
            value={actor}
            onChange={(event) => {
              setActor(event.target.value);
              pager.reset();
            }}
            aria-invalid={!!actor && !actorUserId}
            placeholder="UUID"
          />
        </div>
      </ResultFilters>
      {actor && !actorUserId ? (
        <p role="status" className="text-muted-foreground">
          กรุณากรอกรหัสผู้ดำเนินการแบบ UUID
        </p>
      ) : result.status === "ready" ? (
        <>
          <AdminTable
            label="ประวัติการเปลี่ยนแปลง"
            headings={["เวลา", "การดำเนินการ", "รายการ", "ผู้ดำเนินการ", "รายละเอียด"]}
            empty={!result.value.items.length ? "ไม่พบประวัติที่ตรงกับตัวกรอง" : undefined}
          >
            {result.value.items.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>{formatThaiDateTime(entry.createdAt)}</TableCell>
                <TableCell>{entry.action}</TableCell>
                <TableCell>
                  {entry.entityType}
                  <p className="text-xs text-muted-foreground">{entry.entityId}</p>
                </TableCell>
                <TableCell>
                  {entry.actorUserId ?? entry.actorType}
                  <p className="text-xs text-muted-foreground">{entry.actorRoles.join(", ")}</p>
                  {entry.departmentId && (
                    <p className="text-xs text-muted-foreground">{entry.departmentId}</p>
                  )}
                </TableCell>
                <TableCell>
                  {Object.keys(entry.details).length > 0 && (
                    <details>
                      <summary className="cursor-pointer">ดูรายละเอียด</summary>
                      <pre className="max-w-96 whitespace-pre-wrap [overflow-wrap:anywhere]">
                        {JSON.stringify(entry.details, null, 2)}
                      </pre>
                    </details>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </AdminTable>
          <PaginationBar
            {...pager.controls(result.value.pagination.totalItems, result.value.pagination.page)}
          />
        </>
      ) : (
        <AdminRequestStatus request={result} retry={reload} />
      )}
    </>
  );
}
