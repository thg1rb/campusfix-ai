"use client";

import { useCallback, useDeferredValue, useState } from "react";
import { UserCog, Users } from "lucide-react";
import { toast } from "sonner";
import { ActionLabel, useActionFeedback } from "@/components/shared/ActionFeedback";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { TableCell, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CampusHeading } from "@/components/shared/CampusHeading";
import { PaginationBar } from "@/components/shared/PaginationBar";
import { allResults, matchesSearch, ResultFilters } from "@/components/shared/ResultFilters";
import { usePagination } from "@/hooks/usePagination";
import {
  AccountStatus,
  accountStats,
  adminContext,
  AdminTable,
  matchesStatus,
  statusOptions,
} from "../components/AdminTable";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Choice, ErrorNotice, labelOptions, namedOptions } from "@/components/shared/Controls";
import { MultiChoice } from "@/components/shared/FormControls";
import { RoleBadge, roleLabels } from "@/features/auth";
import { usePrototype } from "@/lib/store/PrototypeStore";
import { useLiveSession } from "@/features/auth/LiveSession";
import { identityErrorMessage } from "@/features/auth/authErrors";
import {
  listAdminDepartments,
  listAdminUsers,
  updateAdminUser,
  type Profile,
  type UserUpdate,
} from "@/lib/api/identity";
import { useApiResource } from "@/lib/api/useApiResource";
import { AdminRequestStatus } from "../components/AdminRequestStatus";
import type { Department, Role, User } from "@/types/domain";

const noDepartment = { value: "none", label: "ไม่สังกัดหน่วยงาน" };

type Account = Profile | User;
type SaveUser = (
  person: Account,
  changes: Required<UserUpdate>,
) => Promise<{ ok: true } | { ok: false; message: string }>;

function UserDialog({
  person,
  departments,
  save,
}: {
  person: Account;
  departments: Department[];
  save: SaveUser;
}) {
  const action = useActionFeedback();
  const [open, setOpen] = useState(false);
  const [roles, setRoles] = useState<string[]>(person.roles);
  const [departmentId, setDepartmentId] = useState(person.departmentId ?? "none");
  const [isActive, setActive] = useState(person.isActive);
  const [error, setError] = useState("");
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) {
          setRoles(person.roles);
          setDepartmentId(person.departmentId ?? "none");
          setActive(person.isActive);
          setError("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" aria-label={`แก้ไขสิทธิ์ @${person.username}`}>
          <UserCog aria-hidden="true" /> แก้ไขสิทธิ์
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>แก้ไขสิทธิ์ @{person.username}</DialogTitle>
          <DialogDescription>กำหนดบทบาท สถานะบัญชี และหน่วยงานที่สังกัด</DialogDescription>
        </DialogHeader>
        <MultiChoice
          legend="บทบาท"
          options={labelOptions(roleLabels)}
          selected={roles}
          onChange={setRoles}
        />
        <Choice
          label="หน่วยงานที่สังกัด"
          options={[
            noDepartment,
            ...namedOptions(
              departments.filter((item) => item.isActive || item.id === person.departmentId),
            ),
          ]}
          value={departmentId}
          onChange={setDepartmentId}
        />
        <Label className="min-h-11">
          <Switch checked={isActive} onCheckedChange={setActive} /> เปิดใช้งานบัญชี
        </Label>
        {error && <ErrorNotice message={error} />}
        <DialogFooter>
          <Button
            disabled={action.pending}
            onClick={() => {
              void action.run(
                () =>
                  save(person, {
                    roles: roles as Role[],
                    departmentId: departmentId === "none" ? null : departmentId,
                    isActive,
                  }),
                (result) => {
                  if (result.ok) {
                    setOpen(false);
                    toast.success("บันทึกสิทธิ์ผู้ใช้แล้ว");
                  } else setError(result.message);
                },
              );
            }}
          >
            <ActionLabel pending={action.pending}>บันทึกสิทธิ์</ActionLabel>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminUsersScreen() {
  const { state, dispatch } = usePrototype();
  const { session, refresh } = useLiveSession();
  const live = session.status === "authenticated";
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("all");
  const pager = usePagination();
  const deferredQuery = useDeferredValue(query);
  const { requestedPage, size } = pager;
  const fetchUsers = useCallback(
    (signal: AbortSignal) =>
      listAdminUsers(
        {
          q: deferredQuery.trim().replace(/^@/, ""),
          role: role === "all" ? undefined : (role as Role),
          isActive: status === "all" ? undefined : status === "active",
          page: requestedPage,
          pageSize: size,
        },
        signal,
      ),
    [deferredQuery, role, status, requestedPage, size],
  );
  const usersRequest = useApiResource(fetchUsers, live);
  const departmentRequest = useApiResource(listAdminDepartments, live);
  const users = state?.users ?? [];
  const departmentItems = live
    ? departmentRequest.result.status === "ready"
      ? departmentRequest.result.value
      : []
    : (state?.departments ?? []);
  const departments = new Map(departmentItems.map((item) => [item.id, item.name]));
  const demoPage = pager.current(
    users.filter(
      (person) =>
        matchesStatus(status, person.isActive) &&
        (role === "all" || person.roles.some((value) => value === role)) &&
        matchesSearch(
          query,
          `@${person.username}`,
          person.realName,
          person.roles.map((value) => roleLabels[value]).join(" "),
          departments.get(person.departmentId ?? ""),
        ),
    ),
  );
  const remote = usersRequest.result;
  const page =
    live && remote.status === "ready"
      ? {
          items: remote.value.items,
          controls: pager.controls(
            remote.value.pagination.totalItems,
            remote.value.pagination.page,
          ),
        }
      : demoPage;

  const save: SaveUser = async (person, changes) => {
    if (!live) return dispatch({ type: "user", id: person.id, ...changes });
    const patch: UserUpdate = {};
    if (
      changes.roles.length !== person.roles.length ||
      changes.roles.some((value) => !person.roles.includes(value))
    ) {
      patch.roles = changes.roles;
    }
    if (changes.departmentId !== person.departmentId) patch.departmentId = changes.departmentId;
    if (changes.isActive !== person.isActive) patch.isActive = changes.isActive;
    if (!Object.keys(patch).length) return { ok: true };
    try {
      await updateAdminUser(person.id, patch);
      if (person.id === session.user?.id) await refresh();
      if (page.items.length === 1 && requestedPage > 1) pager.controls(0).onPage(requestedPage - 1);
      usersRequest.reload();
      return { ok: true };
    } catch (error) {
      return { ok: false, message: identityErrorMessage(error) };
    }
  };

  return (
    <>
      <CampusHeading
        title="จัดการผู้ใช้และสิทธิ์"
        context={adminContext}
        stats={live ? undefined : accountStats(users)}
        icon={Users}
      />
      <ResultFilters
        label="ค้นหาผู้ใช้"
        placeholder={live ? "ค้นหาชื่อผู้ใช้ ชื่อจริง หรืออีเมล…" : "ค้นหาชื่อผู้ใช้ ชื่อจริง หรือหน่วยงาน…"}
        query={query}
        onQuery={(value) => {
          setQuery(value);
          pager.reset();
        }}
        onClear={() => {
          setQuery("");
          setRole("all");
          setStatus("all");
          pager.reset();
        }}
      >
        <div className="w-full sm:w-52">
          <Choice
            label="บทบาท"
            value={role}
            options={[allResults, ...labelOptions(roleLabels)]}
            onChange={(value) => {
              setRole(value);
              pager.reset();
            }}
          />
        </div>
        <div className="w-full sm:w-48">
          <Choice
            label="สถานะบัญชี"
            value={status}
            options={statusOptions}
            onChange={(value) => {
              setStatus(value);
              pager.reset();
            }}
          />
        </div>
      </ResultFilters>
      {live && remote.status !== "ready" ? (
        <AdminRequestStatus request={remote} retry={usersRequest.reload} />
      ) : (
        <>
          {live && departmentRequest.result.status !== "ready" && (
            <AdminRequestStatus
              request={departmentRequest.result}
              retry={departmentRequest.reload}
            />
          )}
          <AdminTable
            label="ผู้ใช้และสิทธิ์"
            headings={["บัญชีผู้ใช้", "บทบาท", "หน่วยงาน", "สถานะ", "จัดการ"]}
            empty={!page.items.length ? "ไม่พบผู้ใช้ที่ตรงกับตัวกรอง" : undefined}
          >
            {page.items.map((person) => (
              <TableRow key={person.id}>
                <TableCell>
                  <div className="flex items-center gap-3 font-medium">
                    <Avatar aria-hidden="true">
                      <AvatarFallback className="bg-accent text-primary">
                        {person.username.slice(0, 1).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span>@{person.username}</span>
                  </div>
                </TableCell>
                <TableCell className="min-w-44 whitespace-normal">
                  <div className="flex flex-wrap gap-1.5">
                    {person.roles.map((role) => (
                      <RoleBadge key={role} role={role} />
                    ))}
                  </div>
                </TableCell>
                <TableCell className="min-w-32 whitespace-normal">
                  {departments.get(person.departmentId ?? "") ?? "—"}
                </TableCell>
                <TableCell>
                  <AccountStatus active={person.isActive} />
                </TableCell>
                <TableCell>
                  {(!live || departmentRequest.result.status === "ready") && (
                    <UserDialog person={person} departments={departmentItems} save={save} />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </AdminTable>
          <PaginationBar {...page.controls} />
        </>
      )}
    </>
  );
}
