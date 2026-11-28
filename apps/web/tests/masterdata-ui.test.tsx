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
const campusMap = vi.hoisted(() => vi.fn(() => null));

vi.mock("@/lib/store/PrototypeStore", () => ({ usePrototype: () => prototype }));
vi.mock("@/features/map", () => ({ CampusMap: campusMap }));
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

function page<T>(items: T[], current = 1, totalItems = items.length) {
  return Response.json({
    items,
    pagination: { page: current, pageSize: 25, totalItems, totalPages: Math.ceil(totalItems / 25) },
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
  campusMap.mockClear();
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
    return page([department], 1, 26);
  });
  vi.stubGlobal("fetch", fetch);
  open("departments");
  await screen.findByText("@active_staff");
  const next = screen.getByRole<HTMLButtonElement>("button", { name: "หน้าถัดไป" });
  const pageSize = screen.getByRole<HTMLButtonElement>("combobox", { name: "จำนวนรายการต่อหน้า" });
  const create = screen.getByRole<HTMLButtonElement>("button", { name: "เพิ่มหน่วยงาน" });
  expect(next.disabled).toBe(false);
  expect(pageSize.disabled).toBe(false);
  expect(create.disabled).toBe(false);
  fireEvent.change(screen.getByRole("searchbox", { name: "ค้นหาหน่วยงาน" }), {
    target: { value: " Lighting " },
  });
  expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining("q=Lighting"), expect.anything());
  await waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("q=Lighting"), expect.anything()),
  );
  expect(screen.getByText("@active_staff")).toBeTruthy();
  expect(next.disabled).toBe(true);
  expect(pageSize.disabled).toBe(true);
  expect(create.disabled).toBe(true);
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "แก้ไข Facilities" }).disabled).toBe(
    true,
  );
  complete(page([]));
  await screen.findByText("ไม่พบหน่วยงานที่ตรงกับตัวกรอง");
  expect(pageSize.disabled).toBe(false);
  expect(create.disabled).toBe(false);
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
      expect(JSON.parse(opts.body as string)).toEqual({ lat: 13.851 });
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
    expect(screen.getByText("13.850000, 100.560000")).toBeTruthy();
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
    expect(fetch.mock.calls.filter(([, options]) => options.method === "PATCH")).toHaveLength(0);
    fireEvent.change(editor.getByRole("textbox", { name: "ละติจูด" }), {
      target: { value: "13.851" },
    });
    fireEvent.click(editor.getByRole("button", { name: "บันทึกสถานที่" }));
    await waitFor(() => {
      expect(fetch.mock.calls.filter(([, options]) => options.method === "PATCH")).toHaveLength(1);
      expect(editor.getByRole("button", { name: "บันทึกสถานที่" })).toBeTruthy();
    });
    expect(editor.getByRole("alert").textContent).toContain("พิกัดภายในวิทยาเขตบางเขน");
  } finally {
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
  }
});

it("closes a normalized no-op edit without a PATCH or GET reload", async () => {
  const item = { id: "category", name: "Lighting", description: "Fixtures", isActive: true };
  const fetch = vi.fn(async (path: string) =>
    path === "/api/v1/me" ? Response.json(admin) : page([item]),
  );
  vi.stubGlobal("fetch", fetch);
  open("categories");

  fireEvent.click(await screen.findByRole("button", { name: "แก้ไข Lighting" }));
  const editor = within(screen.getByRole("dialog"));
  fireEvent.change(editor.getByRole("textbox", { name: "ชื่อประเภทปัญหา" }), {
    target: { value: "  Lighting  " },
  });
  fireEvent.click(editor.getByRole("button", { name: "บันทึกประเภทปัญหา" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

  expect(fetch.mock.calls.map(([path]) => path)).toEqual([
    "/api/v1/me",
    "/api/v1/admin/categories?page=1&pageSize=25",
  ]);
});

it("returns to the previous page when a reload leaves the current page empty", async () => {
  const first = { id: "first", name: "Buildings", description: "", isActive: true };
  const last = { id: "last", name: "Walkways", description: "", isActive: true };
  let disabled = false;
  const requests: number[] = [];
  const fetch = vi.fn(async (path: string, options: RequestInit) => {
    if (path === "/api/v1/me") return Response.json(admin);
    if (options.method === "PATCH") {
      expect(path).toBe("/api/v1/admin/categories/last");
      disabled = true;
      return Response.json({ ...last, isActive: false });
    }
    const requestedPage = Number(new URL(path, "http://localhost").searchParams.get("page"));
    requests.push(requestedPage);
    if (requestedPage === 2) return disabled ? page([], 2, 25) : page([last], 2, 26);
    return page([first], 1, disabled ? 25 : 26);
  });
  vi.stubGlobal("fetch", fetch);
  open("categories");

  await screen.findByText("Buildings");
  fireEvent.click(screen.getByRole("button", { name: "หน้าถัดไป" }));
  fireEvent.click(await screen.findByRole("button", { name: "ปิดใช้งาน Walkways" }));
  fireEvent.click(screen.getByRole("button", { name: "ยืนยันปิดใช้งาน" }));

  await screen.findByText("Buildings");
  expect(requests).toEqual([1, 2, 2, 1]);
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "หน้าก่อนหน้า" }).disabled).toBe(true);
});

it("keeps the editor open and explains when the server cannot find the record", async () => {
  const item = { id: "category", name: "Lighting", description: "Fixtures", isActive: true };
  const fetch = vi.fn(async (path: string, options: RequestInit) => {
    if (path === "/api/v1/me") return Response.json(admin);
    if (options.method === "PATCH") return error(404, "NOT_FOUND");
    return page([item]);
  });
  vi.stubGlobal("fetch", fetch);
  open("categories");

  fireEvent.click(await screen.findByRole("button", { name: "แก้ไข Lighting" }));
  const editor = within(screen.getByRole("dialog"));
  fireEvent.change(editor.getByRole("textbox", { name: "ชื่อประเภทปัญหา" }), {
    target: { value: "Electrical" },
  });
  fireEvent.click(editor.getByRole("button", { name: "บันทึกประเภทปัญหา" }));

  expect((await editor.findByRole("alert")).textContent).toContain("ไม่พบรายการนี้ กรุณาโหลดข้อมูลใหม่");
  expect(editor.getByRole<HTMLInputElement>("textbox", { name: "ชื่อประเภทปัญหา" }).value).toBe(
    "Electrical",
  );
});

it("validates trimmed names, control characters, and Unicode character limits", async () => {
  const fetch = vi.fn(async (path: string) =>
    path === "/api/v1/me" ? Response.json(admin) : page([]),
  );
  vi.stubGlobal("fetch", fetch);
  open("categories");

  await screen.findByText("ไม่พบประเภทปัญหาที่ตรงกับตัวกรอง");
  fireEvent.click(screen.getByRole("button", { name: "เพิ่มประเภทปัญหา" }));
  const editor = within(screen.getByRole("dialog"));
  const name = editor.getByRole("textbox", { name: "ชื่อประเภทปัญหา" });
  const details = editor.getByRole("textbox", { name: "คำอธิบาย" });
  const save = editor.getByRole("button", { name: "บันทึกประเภทปัญหา" });

  for (const [value, message] of [
    ["   ", "กรุณากรอกชื่อประเภทปัญหา"],
    ["A\u0085B", "ชื่อห้ามมีอักขระควบคุม"],
    ["🌳".repeat(121), "ชื่อประเภทปัญหาต้องมีความยาวไม่เกิน 120 ตัวอักษร"],
  ]) {
    fireEvent.change(name, { target: { value } });
    fireEvent.click(save);
    expect(editor.getByRole("alert").textContent).toContain(message);
  }
  fireEvent.change(name, { target: { value: ` ${"🌳".repeat(120)} ` } });
  fireEvent.change(details, { target: { value: "ก".repeat(1001) } });
  fireEvent.click(save);
  expect(editor.getByRole("alert").textContent).toContain("คำอธิบายต้องมีความยาวไม่เกิน 1,000 ตัวอักษร");
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("creates a live department with its trimmed responsibility scope", async () => {
  const item = {
    id: "facilities",
    name: "กองกายภาพและสิ่งแวดล้อม",
    responsibilityScope: "ดูแลพื้นที่ส่วนกลาง",
    isActive: true,
  };
  let created = false;
  const fetch = vi.fn(async (path: string, options: RequestInit) => {
    if (path === "/api/v1/me") return Response.json(admin);
    if (options.method === "POST") {
      expect(path).toBe("/api/v1/admin/departments");
      expect(JSON.parse(options.body as string)).toEqual({
        name: item.name,
        responsibilityScope: item.responsibilityScope,
      });
      created = true;
      return Response.json(item, { status: 201 });
    }
    return page(created ? [{ ...item, staffUsernames: [] }] : []);
  });
  vi.stubGlobal("fetch", fetch);
  open("departments");

  await screen.findByText("ไม่พบหน่วยงานที่ตรงกับตัวกรอง");
  fireEvent.click(screen.getByRole("button", { name: "เพิ่มหน่วยงาน" }));
  const editor = within(screen.getByRole("dialog"));
  fireEvent.change(editor.getByRole("textbox", { name: "ชื่อหน่วยงาน" }), {
    target: { value: ` ${item.name} ` },
  });
  fireEvent.change(editor.getByRole("textbox", { name: "ขอบเขตความรับผิดชอบ" }), {
    target: { value: ` ${item.responsibilityScope} ` },
  });
  const save = editor.getByRole<HTMLButtonElement>("button", { name: "บันทึกหน่วยงาน" });
  expect(save.type).toBe("submit");
  expect(save.form).toBeTruthy();
  fireEvent.submit(save.form!);
  await screen.findByRole("button", { name: `แก้ไข ${item.name}` });
  expect(screen.getByText(item.responsibilityScope)).toBeTruthy();
});

it("rejects whitespace coordinates and creates a live location with a valid map point", async () => {
  const item = {
    id: "library",
    name: "สำนักหอสมุด มก.",
    type: "BUILDING",
    lat: 13.847654,
    lng: 100.571816,
    isActive: true,
  };
  let created = false;
  const fetch = vi.fn(async (path: string, options: RequestInit) => {
    if (path === "/api/v1/me") return Response.json(admin);
    if (options.method === "POST") {
      expect(path).toBe("/api/v1/admin/locations");
      expect(JSON.parse(options.body as string)).toEqual({
        name: item.name,
        type: item.type,
        lat: item.lat,
        lng: item.lng,
      });
      created = true;
      return Response.json(item, { status: 201 });
    }
    return page(created ? [item] : []);
  });
  vi.stubGlobal("fetch", fetch);
  open("locations");

  await screen.findByText("ไม่พบสถานที่ที่ตรงกับตัวกรอง");
  fireEvent.click(screen.getByRole("button", { name: "เพิ่มสถานที่" }));
  const editor = within(screen.getByRole("dialog"));
  const lat = editor.getByRole<HTMLInputElement>("textbox", { name: "ละติจูด" });
  const lng = editor.getByRole<HTMLInputElement>("textbox", { name: "ลองจิจูด" });
  const save = editor.getByRole("button", { name: "บันทึกสถานที่" });
  expect(lat.inputMode).toBe("decimal");
  expect(lng.inputMode).toBe("decimal");

  fireEvent.change(editor.getByRole("textbox", { name: "ชื่อสถานที่" }), {
    target: { value: item.name },
  });
  fireEvent.change(lat, { target: { value: "   " } });
  fireEvent.change(lng, { target: { value: "   " } });
  expect(campusMap).toHaveBeenLastCalledWith(
    expect.objectContaining({ point: undefined }),
    undefined,
  );
  fireEvent.click(save);
  expect(editor.getByRole("alert").textContent).toContain("กรุณาระบุละติจูดและลองจิจูดเป็นตัวเลข");
  expect(fetch).toHaveBeenCalledTimes(2);

  fireEvent.change(lat, { target: { value: String(item.lat) } });
  fireEvent.change(lng, { target: { value: String(item.lng) } });
  expect(campusMap).toHaveBeenLastCalledWith(
    expect.objectContaining({ point: { lat: item.lat, lng: item.lng } }),
    undefined,
  );
  fireEvent.click(save);
  await screen.findByRole("button", { name: `แก้ไข ${item.name}` });
  expect(screen.getByText("13.847654, 100.571816")).toBeTruthy();
});
