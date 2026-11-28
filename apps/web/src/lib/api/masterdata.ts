import type { CampusLocation, CampusLocationType, Category, Department } from "@/types/domain";
import { apiFetch, queryString, type PageQuery, type PageResult } from "./client";

export type AdminDepartment = Department & { staffUsernames: string[] };
export type MasterDataQuery = PageQuery & { q?: string; isActive?: boolean };
export type LocationQuery = MasterDataQuery & { type?: CampusLocationType };
export type CategoryInput = Pick<Category, "name"> & Partial<Pick<Category, "description">>;
export type DepartmentInput = Pick<Department, "name"> &
  Partial<Pick<Department, "responsibilityScope">>;
export type LocationInput = Pick<CampusLocation, "name" | "type" | "lat" | "lng">;
type Patch<T> = Partial<T> & { isActive?: boolean };

export type PublicMasterData = {
  categories: Category[];
  departments: Department[];
  locations: CampusLocation[];
};

export function getPublicMasterData(signal?: AbortSignal) {
  return apiFetch<PublicMasterData>("/public/master-data", { signal });
}

export function listAdminCategories(filters: MasterDataQuery, signal?: AbortSignal) {
  return apiFetch<PageResult<Category>>("/admin/categories" + queryString(filters), { signal });
}

export function listAdminDepartmentsPage(filters: MasterDataQuery, signal?: AbortSignal) {
  return apiFetch<PageResult<AdminDepartment>>("/admin/departments" + queryString(filters), {
    signal,
  });
}

export function listAdminLocations(filters: LocationQuery, signal?: AbortSignal) {
  return apiFetch<PageResult<CampusLocation>>("/admin/locations" + queryString(filters), {
    signal,
  });
}

function write<T>(path: string, data: object, id?: string) {
  return apiFetch<T>(id === undefined ? path : path + "/" + encodeURIComponent(id), {
    method: id === undefined ? "POST" : "PATCH",
    body: JSON.stringify(data),
  });
}

export function createAdminCategory(input: CategoryInput) {
  return write<Category>("/admin/categories", input);
}

export function updateAdminCategory(id: string, patch: Patch<CategoryInput>) {
  return write<Category>("/admin/categories", patch, id);
}

export function createAdminDepartment(input: DepartmentInput) {
  return write<Department>("/admin/departments", input);
}

export function updateAdminDepartment(id: string, patch: Patch<DepartmentInput>) {
  return write<Department>("/admin/departments", patch, id);
}

export function createAdminLocation(input: LocationInput) {
  return write<CampusLocation>("/admin/locations", input);
}

export function updateAdminLocation(id: string, patch: Patch<LocationInput>) {
  return write<CampusLocation>("/admin/locations", patch, id);
}
