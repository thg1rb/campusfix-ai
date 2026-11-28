// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { AppShell } from "@/components/shared/AppShell";
import { LiveSessionProvider } from "@/features/auth/LiveSession";
import { PrototypeStoreProvider, usePrototype } from "@/lib/store/PrototypeStore";

vi.mock("next/navigation", () => ({
  usePathname: () => "/reports/new",
  useRouter: () => ({ push: vi.fn() }),
}));

const notice = "ส่วนนี้อยู่ระหว่างเชื่อมต่อกับระบบจริง";
const loading = "กำลังโหลดข้อมูล…";
const routeContent = "Prototype report form";

function HydrationProbe() {
  const { state, demoAvailable } = usePrototype();
  return state && <span data-demo-available={demoAvailable}>Prototype state hydrated</span>;
}

async function renderWithPendingSession(environment: "production" | "development") {
  vi.stubEnv("NODE_ENV", environment);
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("BroadcastChannel", undefined);
  const pending = Promise.withResolvers<Response>();
  const fetch = vi.fn(() => pending.promise);
  vi.stubGlobal("fetch", fetch);
  const Route = vi.fn(() => <p>{routeContent}</p>);

  render(
    <LiveSessionProvider>
      <PrototypeStoreProvider>
        <HydrationProbe />
        <AppShell>
          <Route />
        </AppShell>
      </PrototypeStoreProvider>
    </LiveSessionProvider>,
  );

  await screen.findByText("Prototype state hydrated");
  expect(fetch).toHaveBeenCalledWith("/api/v1/me", expect.anything());
  return { pending, Route, main: within(screen.getByRole("main")) };
}

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("shows the integration notice in production while the live session loads", async () => {
  const { Route, main } = await renderWithPendingSession("production");

  expect(main.getByText(notice)).toBeTruthy();
  expect(main.queryByRole("status")).toBeNull();
  expect(main.queryByText(routeContent)).toBeNull();
  expect(Route).not.toHaveBeenCalled();
});

it("keeps prototype content behind the loading skeleton in development", async () => {
  const { Route, main } = await renderWithPendingSession("development");

  expect(main.getByRole("status").textContent).toBe(loading);
  expect(main.queryByText(routeContent)).toBeNull();
  expect(Route).not.toHaveBeenCalled();
});

it("shows the integration notice for an authenticated development session", async () => {
  const { pending, Route, main } = await renderWithPendingSession("development");
  await act(async () => {
    pending.resolve(Response.json({ id: "id", username: "live_user", roles: ["REPORTER"] }));
  });

  expect(main.getByText(notice)).toBeTruthy();
  expect(main.queryByText(routeContent)).toBeNull();
  expect(Route).not.toHaveBeenCalled();
});

it("shows prototype content for a guest development session", async () => {
  const { pending, Route, main } = await renderWithPendingSession("development");
  expect(Route).not.toHaveBeenCalled();
  await act(async () => {
    pending.resolve(new Response(null, { status: 401 }));
  });

  expect(main.getByText(routeContent)).toBeTruthy();
  expect(Route).toHaveBeenCalled();
});

it("shows all master data links to an exclusive live administrator with demo mode disabled", async () => {
  const { pending } = await renderWithPendingSession("production");
  await act(async () => {
    pending.resolve(
      Response.json({
        id: "admin",
        username: "campus_admin",
        roles: ["ADMINISTRATOR"],
        departmentId: null,
        isActive: true,
      }),
    );
  });

  expect(screen.getByText("Prototype state hydrated").dataset.demoAvailable).toBe("false");
  fireEvent.keyDown(screen.getByRole("button", { name: "ผู้ดูแลระบบ" }), { key: "ArrowDown" });
  const menu = within(await screen.findByRole("menu"));
  for (const [name, href] of [
    ["ประเภทปัญหา", "/admin/categories"],
    ["หน่วยงาน", "/admin/departments"],
    ["สถานที่", "/admin/locations"],
  ]) {
    expect(menu.getByRole("menuitem", { name }).getAttribute("href")).toBe(href);
  }
});
