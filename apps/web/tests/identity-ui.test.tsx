// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LiveSessionProvider, useLiveSession } from "@/features/auth/LiveSession";
import LoginScreen from "@/features/auth/screens/LoginScreen";
import ProfileSettingsScreen from "@/features/auth/screens/ProfileSettingsScreen";
import AdminUsersScreen from "@/features/admin/screens/AdminUsersScreen";
import AdminAnalyticsScreen from "@/features/admin/screens/AdminAnalyticsScreen";
import { LiveAuditLogTable } from "@/features/admin/components/LiveAuditLogTable";
import { AdminLayout } from "@/features/admin/components/AdminLayout";
import type { Profile } from "@/lib/api/identity";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/login",
}));

vi.mock("@/lib/store/PrototypeStore", () => ({
  usePrototype: () => ({ state: null, user: null, dispatch: vi.fn() }),
}));

const user: Profile = {
  id: "id",
  username: "campus_user",
  realName: "Campus User",
  email: "campus@ku.th",
  emailVerified: true,
  hostedDomain: "ku.th",
  avatarUrl: null,
  authProvider: "GOOGLE",
  roles: ["REPORTER"],
  departmentId: null,
  isActive: true,
  createdAt: "2026-11-27T00:00:00Z",
};
const admin: Profile = { ...user, id: "admin", roles: ["ADMINISTRATOR"] };

function page<T>(items: T[]) {
  return Response.json({
    items,
    pagination: { page: 1, pageSize: 25, totalItems: items.length, totalPages: 1 },
  });
}

function errorResponse(status: number, code: string) {
  return Response.json(
    { error: { code, message: code, details: {}, requestId: "test" } },
    { status },
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("renders the browser login handoff and a readable OAuth failure", () => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => errorResponse(401, "UNAUTHENTICATED")),
  );
  render(
    <LiveSessionProvider>
      <LoginScreen next="/settings/profile" error="INVALID_OAUTH_IDENTITY" />
    </LiveSessionProvider>,
  );
  expect(
    screen.getByRole("link", { name: "เข้าสู่ระบบด้วยบัญชี Google (@ku.th)" }).getAttribute("href"),
  ).toBe("/login/start?next=%2Fsettings%2Fprofile");
  expect(screen.getByRole("alert").textContent).toContain("ที่ยืนยันอีเมลแล้ว");
});

it("loads a live profile, shows a username conflict, and adopts the updated profile", async () => {
  let attempts = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, options: RequestInit) => {
      if (path === "/api/v1/me") return Response.json(user);
      expect(path).toBe("/api/v1/me/username");
      expect(options.body).toBe('{"username":"updated_name"}');
      if (++attempts === 1) return errorResponse(409, "USERNAME_TAKEN");
      return Response.json({ ...user, username: "updated_name" });
    }),
  );
  render(
    <LiveSessionProvider>
      <ProfileSettingsScreen />
    </LiveSessionProvider>,
  );
  expect(await screen.findByText(user.email)).toBeTruthy();
  fireEvent.change(screen.getByRole("textbox", { name: "ชื่อผู้ใช้สาธารณะ" }), {
    target: { value: "updated_name" },
  });
  fireEvent.click(screen.getByRole("button", { name: "บันทึกชื่อผู้ใช้" }));
  expect((await screen.findByRole("alert")).textContent).toContain("ถูกใช้แล้ว");
  fireEvent.click(screen.getByRole("button", { name: "บันทึกชื่อผู้ใช้" }));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "บันทึกชื่อผู้ใช้" }).disabled).toBe(true);
});

it("revokes the live session and clears the displayed account", async () => {
  const fetch = vi.fn(async (path: string) =>
    path === "/api/v1/me" ? Response.json(user) : new Response(null, { status: 204 }),
  );
  vi.stubGlobal("fetch", fetch);
  function SessionView() {
    const { session, signOut } = useLiveSession();
    return (
      <>
        <p>{session.user?.username ?? session.status}</p>
        <button onClick={() => void signOut()}>Logout</button>
      </>
    );
  }
  render(
    <LiveSessionProvider>
      <SessionView />
    </LiveSessionProvider>,
  );
  await screen.findByText(user.username);
  fireEvent.click(screen.getByRole("button", { name: "Logout" }));
  await screen.findByText("guest");
  expect(fetch).toHaveBeenCalledWith(
    "/api/v1/auth/logout",
    expect.objectContaining({ method: "POST" }),
  );
});

it("loads live admin users and submits access changes with server validation", async () => {
  const fetch = vi.fn(async (path: string, options: RequestInit) => {
    if (path === "/api/v1/me") return Response.json(admin);
    if (path.startsWith("/api/v1/admin/departments")) return page([]);
    if (path.startsWith("/api/v1/admin/users?")) return page([user]);
    expect(path).toBe("/api/v1/admin/users/id");
    expect(options.body).toBe('{"isActive":false}');
    return errorResponse(422, "EXCLUSIVE_ADMIN_CONFLICT");
  });
  vi.stubGlobal("fetch", fetch);
  render(
    <LiveSessionProvider>
      <AdminUsersScreen />
    </LiveSessionProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "แก้ไขสิทธิ์ @campus_user" }));
  fireEvent.click(screen.getByRole("switch"));
  fireEvent.click(screen.getByRole("button", { name: "บันทึกสิทธิ์" }));
  expect((await screen.findByRole("alert")).textContent).toContain("ต้องมีบทบาทเดียว");
});

it("loads audit history for a live administrator", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) => {
      if (path === "/api/v1/me") return Response.json(admin);
      expect(path).toBe("/api/v1/admin/audit-logs?page=1&pageSize=25");
      return page([
        {
          id: "audit",
          action: "MANAGE_USER",
          entityType: "USER",
          entityId: user.id,
          actorType: "USER",
          actorUserId: admin.id,
          actorRoles: admin.roles,
          details: {},
          createdAt: user.createdAt,
        },
      ]);
    }),
  );
  render(
    <LiveSessionProvider>
      <AdminAnalyticsScreen />
    </LiveSessionProvider>,
  );
  expect(await screen.findByText("MANAGE_USER")).toBeTruthy();
});

it("debounces user search and keeps the old rows visible while the new results load", async () => {
  const response = Promise.withResolvers<Response>();
  const fetch = vi.fn(async (path: string) => {
    if (path === "/api/v1/me") return Response.json(admin);
    if (path.startsWith("/api/v1/admin/departments")) return page([]);
    return path.includes("q=") ? response.promise : page([user]);
  });
  vi.stubGlobal("fetch", fetch);
  render(
    <LiveSessionProvider>
      <AdminUsersScreen />
    </LiveSessionProvider>,
  );
  await screen.findByText(user.realName);
  expect(screen.getByText(user.email)).toBeTruthy();
  const search = screen.getByRole("searchbox", { name: "ค้นหาผู้ใช้" });
  for (const value of ["c", "ca", "campus"]) fireEvent.change(search, { target: { value } });
  expect(fetch.mock.calls.filter(([path]) => path.includes("q="))).toEqual([]);
  await waitFor(() =>
    expect(fetch.mock.calls.map(([path]) => path).filter((path) => path.includes("q="))).toEqual([
      "/api/v1/admin/users?q=campus&page=1&pageSize=25",
    ]),
  );
  expect(screen.getByText(user.email)).toBeTruthy();
  expect(
    screen.getByRole<HTMLButtonElement>("button", { name: "แก้ไขสิทธิ์ @campus_user" }).disabled,
  ).toBe(true);
  await act(async () => response.resolve(page([])));
  expect(await screen.findByText("ไม่พบผู้ใช้ที่ตรงกับตัวกรอง")).toBeTruthy();
});

it("guards private admin account details at the layout boundary", async () => {
  const fetch = vi.fn(async () => Response.json(user));
  vi.stubGlobal("fetch", fetch);
  render(
    <LiveSessionProvider>
      <AdminLayout>
        <AdminUsersScreen />
      </AdminLayout>
    </LiveSessionProvider>,
  );
  await screen.findByText("คุณไม่มีสิทธิ์เข้าถึงหน้านี้");
  expect(screen.queryByText(user.email)).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("keeps the last row on a valid page and steps back only when the fresh response is empty", async () => {
  let edits = 0;
  const requested: string[] = [];
  const secondUser = { ...user, id: "second", username: "second_user" };
  const fetch = vi.fn(async (path: string, options: RequestInit) => {
    if (path === "/api/v1/me") return Response.json(admin);
    if (path.startsWith("/api/v1/admin/departments")) return page([]);
    if (options.method === "PATCH")
      return Response.json({ ...secondUser, isActive: ++edits % 2 === 0 });
    const index = new URL(path, "http://localhost").searchParams.get("page") ?? "";
    const items =
      index === "1" ? [user] : edits >= 2 ? [] : [{ ...secondUser, isActive: edits === 0 }];
    requested.push(index);
    return Response.json({
      items,
      pagination: {
        page: Number(index),
        pageSize: 25,
        totalItems: edits >= 2 ? 25 : 26,
        totalPages: edits >= 2 ? 1 : 2,
      },
    });
  });
  vi.stubGlobal("fetch", fetch);
  render(
    <LiveSessionProvider>
      <AdminUsersScreen />
    </LiveSessionProvider>,
  );
  await screen.findByText("@campus_user");
  fireEvent.click(screen.getByRole("button", { name: "หน้าถัดไป" }));
  for (let attempt = 0; attempt < 2; attempt++) {
    const trigger = await screen.findByRole<HTMLButtonElement>("button", {
      name: "แก้ไขสิทธิ์ @second_user",
    });
    await waitFor(() => expect(trigger.disabled).toBe(false));
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("button", { name: "บันทึกสิทธิ์" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  }
  expect(await screen.findByText("@campus_user")).toBeTruthy();
  expect(requested).toEqual(["1", "2", "2", "2", "1"]);
});

it("suppresses invalid audit UUIDs and treats spaces as the empty filter", async () => {
  const fetch = vi.fn(async () => page([]));
  vi.stubGlobal("fetch", fetch);
  render(<LiveAuditLogTable />);
  await screen.findByText("ไม่พบประวัติที่ตรงกับตัวกรอง");
  const field = screen.getByRole("textbox", { name: "รหัสผู้ดำเนินการ" });
  fireEvent.change(field, { target: { value: "   " } });
  expect(field.getAttribute("aria-invalid")).toBe("false");
  expect(fetch).toHaveBeenCalledTimes(1);
  fireEvent.change(field, { target: { value: "invalid" } });
  fireEvent.change(screen.getByRole("searchbox", { name: "รหัสการดำเนินการ" }), {
    target: { value: "login" },
  });
  await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
  expect(fetch).toHaveBeenCalledTimes(1);
  fireEvent.change(field, { target: { value: "  12345678-1234-1234-1234-123456789ABC  " } });
  await waitFor(() =>
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/v1/admin/audit-logs?action=LOGIN&actorUserId=12345678-1234-1234-1234-123456789abc&page=1&pageSize=25",
      expect.anything(),
    ),
  );
});

function SessionValue() {
  const { session, replaceUser, signOut } = useLiveSession();
  return (
    <>
      <p>{session.user?.username ?? session.status}</p>
      <button onClick={() => replaceUser({ ...user, username: "local_update" })}>Replace</button>
      <button onClick={() => void signOut()}>Logout</button>
    </>
  );
}

it("broadcasts only invalidation signals and ignores a stale read after remote logout", async () => {
  const instance = {
    onmessage: null as ((event: { data: string }) => void) | null,
    postMessage: vi.fn(),
    close: vi.fn(),
  };
  vi.stubGlobal(
    "BroadcastChannel",
    class {
      constructor() {
        return instance;
      }
    },
  );
  let next = Promise.resolve(Response.json(user));
  const fetch = vi.fn((path: string) =>
    path === "/api/v1/me" ? next : Promise.resolve(new Response(null, { status: 204 })),
  );
  vi.stubGlobal("fetch", fetch);
  render(
    <LiveSessionProvider>
      <SessionValue />
    </LiveSessionProvider>,
  );
  await screen.findByText(user.username);
  fireEvent.click(screen.getByRole("button", { name: "Replace" }));
  expect(instance.postMessage).toHaveBeenLastCalledWith("profile-changed");
  next = Promise.resolve(Response.json({ ...user, username: "remote_update" }));
  await act(async () => instance.onmessage?.({ data: "profile-changed" }));
  expect(screen.getByText("remote_update")).toBeTruthy();
  const pending = Promise.withResolvers<Response>();
  next = pending.promise;
  act(() => instance.onmessage?.({ data: "profile-changed" }));
  act(() => instance.onmessage?.({ data: "logout" }));
  await act(async () => pending.resolve(Response.json(user)));
  expect(screen.getByText("guest")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Replace" }));
  expect(screen.getByText("guest")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Logout" }));
  await waitFor(() => expect(instance.postMessage).toHaveBeenLastCalledWith("logout"));
});

it("refreshes when the tab becomes visible without a broadcast channel", async () => {
  vi.stubGlobal("BroadcastChannel", undefined);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json(user))
    .mockResolvedValueOnce(errorResponse(401, "UNAUTHENTICATED"));
  vi.stubGlobal("fetch", fetch);
  render(
    <LiveSessionProvider>
      <SessionValue />
    </LiveSessionProvider>,
  );
  await screen.findByText(user.username);
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  await screen.findByText("guest");
  expect(fetch).toHaveBeenCalledTimes(2);
});
