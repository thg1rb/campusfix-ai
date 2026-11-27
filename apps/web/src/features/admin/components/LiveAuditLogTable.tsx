"use client";

import { useCallback, useState } from "react";
import { Choice } from "@/components/shared/Controls";
import { PaginationBar } from "@/components/shared/PaginationBar";
import { allResults, ResultFilters } from "@/components/shared/ResultFilters";
import { TableCell, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
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
  const debouncedAction = useDebouncedValue(action.trim().toUpperCase());
  const trimmedActor = actor.trim();
  const actorUserId = uuid.test(trimmedActor) ? trimmedActor.toLowerCase() : undefined;
  const invalidActor = !!trimmedActor && !actorUserId;
  const pager = usePagination(JSON.stringify([debouncedAction, entity, actorUserId]));
  const { requestedPage, size } = pager;
  const load = useCallback(
    (signal: AbortSignal) =>
      listAdminAuditLogs(
        {
          action: debouncedAction,
          entityType: entity === "all" ? undefined : (entity as AuditEntry["entityType"]),
          actorUserId,
          page: requestedPage,
          pageSize: size,
        },
        signal,
      ),
    [debouncedAction, entity, actorUserId, requestedPage, size],
  );
  const { result, reload, previousValue, isRefreshing } = useApiResource(load, !invalidActor);
  const page = result.status === "ready" ? result.value : previousValue;
  return (
    <>
      <ResultFilters
        label="รหัสการดำเนินการ"
        placeholder="เช่น MANAGE_USER"
        query={action}
        onQuery={setAction}
        onClear={() => {
          setAction("");
          setEntity("all");
          setActor("");
        }}
      >
        <Choice label="ประเภทข้อมูล" value={entity} options={entityOptions} onChange={setEntity} />
        <div className="grid gap-2">
          <Label htmlFor="audit-actor">รหัสผู้ดำเนินการ</Label>
          <Input
            id="audit-actor"
            value={actor}
            onChange={(event) => setActor(event.target.value)}
            aria-invalid={invalidActor}
            placeholder="UUID"
          />
        </div>
      </ResultFilters>
      {invalidActor ? (
        <p role="status" className="text-muted-foreground">
          กรุณากรอกรหัสผู้ดำเนินการแบบ UUID
        </p>
      ) : (
        <>
          {result.status !== "ready" && <AdminRequestStatus request={result} retry={reload} />}
          {page && (
            <div className="grid gap-4" aria-busy={isRefreshing}>
              <AdminTable
                label="ประวัติการเปลี่ยนแปลง"
                headings={["เวลา", "การดำเนินการ", "รายการ", "ผู้ดำเนินการ", "รายละเอียด"]}
                empty={!page.items.length ? "ไม่พบประวัติที่ตรงกับตัวกรอง" : undefined}
              >
                {page.items.map((entry) => (
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
                {...pager.controls(page.pagination.totalItems, page.pagination.page)}
                disabled={result.status !== "ready"}
              />
            </div>
          )}
        </>
      )}
    </>
  );
}
