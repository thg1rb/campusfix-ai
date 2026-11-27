// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LiveSessionProvider, useLiveSession } from "@/features/auth/LiveSession";
import LoginScreen from "@/features/auth/screens/LoginScreen";
import ProfileSettingsScreen from "@/features/auth/screens/ProfileSettingsScreen";
import AdminUsersScreen from "@/features/admin/screens/AdminUsersScreen";
import AdminAnalyticsScreen from "@/features/admin/screens/AdminAnalyticsScreen";
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
