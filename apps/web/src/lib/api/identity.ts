import type { AuditLogEntry, Department, Role, User } from "@/types/domain";
import { apiFetch, queryString, type PageQuery, type PageResult } from "./client";
import { listAdminDepartmentsPage } from "./masterdata";

export type { PageSize, PageQuery, PageResult } from "./client";

export type Profile = Omit<User, "providerSubjectId" | "authProvider" | "hostedDomain"> & {
  authProvider: string;
  hostedDomain: string | null;
};

export type AuditEntry = Omit<AuditLogEntry, "actorId" | "actorRoles"> & {
  actorType: "USER" | "SYSTEM" | "AI_SERVICE";
  actorUserId: string | null;
  actorRoles: Role[];
};

export type UserUpdate = { roles?: Role[]; departmentId?: string | null; isActive?: boolean };
export type UserQuery = PageQuery & { q?: string; role?: Role; isActive?: boolean };
export type AuditQuery = PageQuery & {
  entityType?: AuditEntry["entityType"];
  action?: string;
  actorUserId?: string;
};

export function getLoginUrl(next?: string) {
  return "/api/v1/auth/login" + queryString({ next });
}

export function getBrowserLoginUrl(next?: string) {
  return "/login/start" + queryString({ next });
}

export function getMe(signal?: AbortSignal) {
  return apiFetch<Profile>("/me", { signal });
}

export function logout() {
  return apiFetch<void>("/auth/logout", { method: "POST" });
}

export function updateUsername(username: string) {
  return apiFetch<Profile>("/me/username", { method: "PATCH", body: JSON.stringify({ username }) });
}

export function listAdminUsers(filters: UserQuery, signal?: AbortSignal) {
  return apiFetch<PageResult<Profile>>("/admin/users" + queryString(filters), { signal });
}

export function updateAdminUser(id: string, changes: UserUpdate) {
  return apiFetch<Profile>("/admin/users/" + encodeURIComponent(id), {
    method: "PATCH",
    body: JSON.stringify(changes),
  });
}

export function listAdminAuditLogs(filters: AuditQuery, signal?: AbortSignal) {
  return apiFetch<PageResult<AuditEntry>>("/admin/audit-logs" + queryString(filters), { signal });
}

export async function listAdminDepartments(signal?: AbortSignal): Promise<Department[]> {
  const first = await listAdminDepartmentsPage({ pageSize: 100 }, signal);
  const departments = first.items.slice();
  for (let page = 2; page <= first.pagination.totalPages; page++) {
    const result = await listAdminDepartmentsPage({ page, pageSize: 100 }, signal);
    departments.push(...result.items);
  }
  return departments;
}
