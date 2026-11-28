import { afterEach, expect, it, vi } from "vitest";
import { listAdminDepartments } from "@/lib/api/identity";
import {
  createAdminCategory,
  createAdminDepartment,
  createAdminLocation,
  getPublicMasterData,
  listAdminCategories,
  listAdminDepartmentsPage,
  listAdminLocations,
  updateAdminCategory,
  updateAdminDepartment,
  updateAdminLocation,
} from "@/lib/api/masterdata";

afterEach(() => vi.unstubAllGlobals());

it("reads public and admin master data with same-origin requests, abort signals, and filters", async () => {
  const fetch = vi.fn(async () => Response.json({}));
  vi.stubGlobal("fetch", fetch);
  const { signal } = new AbortController();
  await getPublicMasterData(signal);
  await listAdminCategories({ q: "ทาง เดิน", page: 2, pageSize: 50, isActive: false }, signal);
  await listAdminDepartmentsPage({ q: "Lighting" }, signal);
  await listAdminLocations({ type: "COMMON_AREA", isActive: true }, signal);
  const paths = [
    "/api/v1/public/master-data",
    "/api/v1/admin/categories?q=%E0%B8%97%E0%B8%B2%E0%B8%87+%E0%B9%80%E0%B8%94%E0%B8%B4%E0%B8%99&page=2&pageSize=50&isActive=false",
    "/api/v1/admin/departments?q=Lighting",
    "/api/v1/admin/locations?type=COMMON_AREA&isActive=true",
  ];
  paths.forEach((path, i) =>
    expect(fetch).toHaveBeenNthCalledWith(
      i + 1,
      path,
      expect.objectContaining({ credentials: "include", cache: "no-store", signal }),
    ),
  );
});

it("serializes each create and update body and keeps API error codes", async () => {
  const fetch = vi.fn(async (_path: string, options: RequestInit) => {
    expect(new Headers(options.headers).get("Content-Type")).toBe("application/json");
    return Response.json({});
  });
  vi.stubGlobal("fetch", fetch);
  const location = { name: "Walkway", type: "ROAD", lat: 13.85, lng: 100.56 } as const;
  await createAdminCategory({ name: "Test" });
  await createAdminDepartment({ name: "Facilities", responsibilityScope: "" });
  await createAdminLocation(location);
  await updateAdminCategory("a/b", { description: "" });
  await updateAdminDepartment("department", { isActive: false });
  await updateAdminLocation("location", { lat: 13.858 });
  expect(fetch.mock.calls.map(([path, options]) => [path, options.method, options.body])).toEqual([
    ["/api/v1/admin/categories", "POST", '{"name":"Test"}'],
    ["/api/v1/admin/departments", "POST", '{"name":"Facilities","responsibilityScope":""}'],
    ["/api/v1/admin/locations", "POST", JSON.stringify(location)],
    ["/api/v1/admin/categories/a%2Fb", "PATCH", '{"description":""}'],
    ["/api/v1/admin/departments/department", "PATCH", '{"isActive":false}'],
    ["/api/v1/admin/locations/location", "PATCH", '{"lat":13.858}'],
  ]);
  fetch.mockResolvedValueOnce(
    Response.json(
      { error: { code: "NAME_TAKEN", message: "Taken", requestId: "req" } },
      { status: 409 },
    ),
  );
  await expect(createAdminCategory({ name: "Test" })).rejects.toMatchObject({
    name: "ApiError",
    status: 409,
    code: "NAME_TAKEN",
    requestId: "req",
  });
});

it("continues paging through departments for Admin Users", async () => {
  const fetch = vi.fn(async (path: string) => {
    const second = path.includes("page=2");
    return Response.json({
      items: [{ id: second ? "second" : "first", staffUsernames: [] }],
      pagination: { totalPages: 2 },
    });
  });
  vi.stubGlobal("fetch", fetch);
  const { signal } = new AbortController();
  expect((await listAdminDepartments(signal)).map((item) => item.id)).toEqual(["first", "second"]);
  expect(fetch).toHaveBeenLastCalledWith(
    "/api/v1/admin/departments?page=2&pageSize=100",
    expect.objectContaining({ signal }),
  );
});
