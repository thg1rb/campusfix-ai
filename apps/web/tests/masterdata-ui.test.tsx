// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AdminLayout } from "@/features/admin/components/AdminLayout";
import { MasterDataScreen } from "@/features/admin/components/MasterDataScreen";
import { LiveSessionProvider } from "@/features/auth/LiveSession";
import type { Profile } from "@/lib/api/identity";

const prototype = vi.hoisted(() => ({
  state: null as object | null,
  user: null as object | null,
  demoAvailable: false,
  dispatch: vi.fn(),
}));

vi.mock("@/lib/store/PrototypeStore", () => ({ usePrototype: () => prototype }));
vi.mock("@/features/map", () => ({ CampusMap: () => null }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/categories",
}));

const admin: Profile = {
  id: "admin",
  username: "campus_admin",
  realName: "Campus Admin",
  email: "admin@ku.th",
  emailVerified: true,
  hostedDomain: "ku.th",
  avatarUrl: null,
  authProvider: "GOOGLE",
  roles: ["ADMINISTRATOR"],
  departmentId: null,
  isActive: true,
  createdAt: "2026-11-27T00:00:00Z",
};

function error(status: number, code: string) {
  return Response.json(
    { error: { code, message: code, details: {}, requestId: "test" } },
    { status },
  );
}

function page<T>(items: T[]) {
  return Response.json({
    items,
    pagination: { page: 1, pageSize: 25, totalItems: items.length, totalPages: 1 },
  });
}

function open(collection: "categories" | "departments" | "locations") {
  return render(
    <LiveSessionProvider>
      <AdminLayout>
        <MasterDataScreen collection={collection} />
      </AdminLayout>
    </LiveSessionProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  prototype.state = null;
  prototype.user = null;
  prototype.demoAvailable = false;
  prototype.dispatch.mockReset();
});

it("creates, edits, and toggles live categories with targeted PATCH bodies and recoverable errors", async () => {
  let item = { id: "category-id", name: "Existing", description: "Before", isActive: true };
  let creates = 0;
  let toggles = 0;
  const fetch = vi.fn(async (path: string, opts: RequestInit) => {
    if (path === "/api/v1/me") return Response.json(admin);
    if (opts.method === "POST") {
      expect(path).toBe("/api/v1/admin/categories");
      expect(JSON.parse(opts.body as string)).toEqual({ name: "New category", description: "" });
      if (++creates === 1) return error(409, "NAME_TAKEN");
      item = { ...item, name: "New category", description: "" };
      return Response.json(item, { status: 201 });
    }
    if (opts.method === "PATCH") {
      expect(path).toBe("/api/v1/admin/categories/category-id");
      const patch = JSON.parse(opts.body as string);
      if ("isActive" in patch) {
        expect(patch).toEqual({ isActive: false });
        if (++toggles === 1) return error(403, "FORBIDDEN");
      } else {
        expect(patch).toEqual({ description: "Changed" });
      }
      item = { ...item, ...patch };
      return Response.json(item);
    }
    expect(path).toMatch(/^\/api\/v1\/admin\/categories\?/);
    return page([item]);
  });
  vi.stubGlobal("fetch", fetch);
  open("categories");
  await screen.findByText("Existing");

  fireEvent.click(screen.getByRole("button", { name: "เพิ่มประเภทปัญหา" }));
  const create = within(screen.getByRole("dialog"));
  fireEvent.change(create.getByRole("textbox", { name: "ชื่อประเภทปัญหา" }), {
    target: { value: "New category" },
  });
  fireEvent.click(create.getByRole("button", { name: "บันทึกประเภทปัญหา" }));
  expect((await create.findByRole("alert")).textContent).toContain("ถูกใช้แล้ว");
  fireEvent.click(create.getByRole("button", { name: "บันทึกประเภทปัญหา" }));
  await screen.findByRole("button", { name: "แก้ไข New category" });

  fireEvent.click(screen.getByRole("button", { name: "แก้ไข New category" }));
  const edit = within(screen.getByRole("dialog"));
  fireEvent.change(edit.getByRole("textbox", { name: "คำอธิบาย" }), {
    target: { value: "Changed" },
  });
  fireEvent.click(edit.getByRole("button", { name: "บันทึกประเภทปัญหา" }));
  await screen.findByText("Changed");

  fireEvent.click(await screen.findByRole("button", { name: "ปิดใช้งาน New category" }));
  const toggle = within(screen.getByRole("alertdialog"));
  fireEvent.click(toggle.getByRole("button", { name: "ยืนยันปิดใช้งาน" }));
  expect((await toggle.findByRole("alert")).textContent).toContain("ไม่มีสิทธิ์");
  fireEvent.click(toggle.getByRole("button", { name: "ยืนยันปิดใช้งาน" }));
  await screen.findByRole("button", { name: "เปิดใช้งาน New category" });
  expect(prototype.dispatch).not.toHaveBeenCalled();
});

it("renders department staff and keeps the previous rows while debounced server search refreshes", async () => {
  let complete: (value: Response) => void = () => {};
  const refreshed = new Promise<Response>((resolve) => {
    complete = resolve;
  });
  const department = {
    id: "department",
    name: "Facilities",
    responsibilityScope: "Lighting",
    isActive: true,
    staffUsernames: ["active_staff"],
  };
  const fetch = vi.fn(async (path: string) => {
    if (path === "/api/v1/me") return Response.json(admin);
    if (path.includes("q=Lighting")) return refreshed;
    return page([department]);
  });
  vi.stubGlobal("fetch", fetch);
  open("departments");
  await screen.findByText("@active_staff");
  fireEvent.change(screen.getByRole("searchbox", { name: "ค้นหาหน่วยงาน" }), {
    target: { value: " Lighting " },
  });
  expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining("q=Lighting"), expect.anything());
  await waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("q=Lighting"), expect.anything()),
  );
  expect(screen.getByText("@active_staff")).toBeTruthy();
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "แก้ไข Facilities" }).disabled).toBe(
    true,
  );
  complete(page([]));
  await screen.findByText("ไม่พบหน่วยงานที่ตรงกับตัวกรอง");
});

it("loads and edits the development guest prototype through its store", async () => {
  prototype.demoAvailable = true;
  prototype.user = admin;
  prototype.state = {
    categories: [{ id: "cat-bldg", name: "Demo", description: "", isActive: true }],
  };
  prototype.dispatch.mockResolvedValue({ ok: true });
  const fetch = vi.fn(async () => error(401, "UNAUTHENTICATED"));
  vi.stubGlobal("fetch", fetch);
  open("categories");
  fireEvent.click(await screen.findByRole("button", { name: "แก้ไข Demo" }));
  const edit = within(screen.getByRole("dialog"));
  fireEvent.change(edit.getByRole("textbox", { name: "ชื่อประเภทปัญหา" }), {
    target: { value: "Demo update" },
  });
  fireEvent.click(edit.getByRole("button", { name: "บันทึกประเภทปัญหา" }));
  await waitFor(() =>
    expect(prototype.dispatch).toHaveBeenCalledWith({
      type: "master",
      collection: "categories",
      item: { id: "cat-bldg", name: "Demo update", isActive: true, description: "" },
    }),
  );
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith("/api/v1/me", expect.anything());
});

it("filters locations by type and active status and explains campus coordinate errors", async () => {
  const location = {
    id: "road-id",
    name: "Roadway",
    type: "ROAD",
    lat: 13.85,
    lng: 100.56,
    isActive: false,
  };
  const fetch = vi.fn(async (path: string, opts: RequestInit) => {
    if (path === "/api/v1/me") return Response.json(admin);
    if (opts.method === "PATCH") {
      expect(path).toBe("/api/v1/admin/locations/road-id");
      expect(JSON.parse(opts.body as string)).toEqual({ lat: 14 });
      return error(422, "COORDINATES_OUT_OF_BOUNDS");
    }
    return page([location]);
  });
  vi.stubGlobal("fetch", fetch);
  // Radix scrolls its selected option into view when the listbox opens.
  const scrollIntoView = HTMLElement.prototype.scrollIntoView;
  HTMLElement.prototype.scrollIntoView = vi.fn();
  try {
    open("locations");
    await screen.findByText("Roadway");
    fireEvent.keyDown(screen.getByRole("combobox", { name: "ประเภทสถานที่" }), { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: "ถนน" }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining("type=ROAD"), expect.anything()),
    );
    fireEvent.keyDown(screen.getByRole("combobox", { name: "สถานะการใช้งาน" }), {
      key: "ArrowDown",
    });
    fireEvent.click(await screen.findByRole("option", { name: "ปิดใช้งาน" }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("isActive=false&type=ROAD"),
        expect.anything(),
      ),
    );
    fireEvent.click(await screen.findByRole("button", { name: "แก้ไข Roadway" }));
    const editor = within(screen.getByRole("dialog"));
    fireEvent.change(editor.getByRole("textbox", { name: "ละติจูด" }), { target: { value: "14" } });
    fireEvent.click(editor.getByRole("button", { name: "บันทึกสถานที่" }));
    expect((await editor.findByRole("alert")).textContent).toContain("พิกัดภายในวิทยาเขตบางเขน");
  } finally {
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
  }
});
