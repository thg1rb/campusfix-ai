import type { AuditLogEntry, Department, Role, User } from "@/types/domain";
import { apiFetch } from "./client";

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
export type PageSize = 25 | 50 | 100;
export type PageQuery = { page?: number; pageSize?: PageSize };
export type PageResult<T> = {
  items: T[];
  pagination: { page: number; pageSize: PageSize; totalItems: number; totalPages: number };
};
export type UserQuery = PageQuery & { q?: string; role?: Role; isActive?: boolean };
export type AuditQuery = PageQuery & {
  entityType?: AuditEntry["entityType"];
  action?: string;
  actorUserId?: string;
};

function queryString(filters: Record<string, string | boolean | number | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  return query.size ? "?" + query : "";
}

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
  const first = await apiFetch<PageResult<Department>>("/admin/departments?pageSize=100", {
    signal,
  });
  const departments = first.items.slice();
  for (let page = 2; page <= first.pagination.totalPages; page++) {
    const result = await apiFetch<PageResult<Department>>(
      "/admin/departments" + queryString({ page, pageSize: 100 }),
      { signal },
    );
    departments.push(...result.items);
  }
  return departments;
}
