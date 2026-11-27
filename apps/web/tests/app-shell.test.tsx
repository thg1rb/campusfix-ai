// @vitest-environment jsdom

import { act, cleanup, render, screen, within } from "@testing-library/react";
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
  const { state } = usePrototype();
  return state && <span>Prototype state hydrated</span>;
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
