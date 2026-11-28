// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { LiveSessionProvider } from "@/features/auth/LiveSession";
import CreateReportScreen from "@/features/reports/screens/CreateReportScreen";
import EditPendingReportScreen from "@/features/reports/screens/EditPendingReportScreen";
import MyReportsScreen from "@/features/reports/screens/MyReportsScreen";
import type { ReportDetail, ReportImageAttachment } from "@/lib/api/reports";
import type { CampusLocation, ReportLocation } from "@/types/domain";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  prototype: {
    state: null as object | null,
    user: null as object | null,
    demoAvailable: false,
    dispatch: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("@/lib/store/PrototypeStore", () => ({ usePrototype: () => mocks.prototype }));
vi.mock("@/features/map", () => ({
  CampusMapPicker: ({
    locations,
    onChange,
  }: {
    locations: CampusLocation[];
    onChange: (location: ReportLocation) => void;
  }) =>
    locations.map(({ id, name, lat, lng }) => (
      <button
        key={id}
        type="button"
        onClick={() => onChange({ locationId: id, locationName: name, lat, lng })}
      >
        {name}
      </button>
    )),
}));

const number = "RPT-2026-00001";
const reportURL = "/api/v1/reports/report-id";
const timestamp = "2026-11-28T00:00:00Z";
const location = {
  locationId: "location-id",
  locationName: "Campus Gate",
  detailNote: null,
  lat: 13.85,
  lng: 100.56,
};
const image: ReportImageAttachment = {
  id: "image-id",
  fileName: "photo.png",
  mimeType: "image/png",
  sizeBytes: 12,
  sortOrder: 0,
  previewUrl: "/api/v1/media/report-images/image-id",
};
const pending: ReportDetail = {
  id: "report-id",
  reportNumber: number,
  reporterId: "reporter",
  status: "PENDING_REVIEW",
  version: 1,
  description: "Broken walkway",
  location,
  images: [image],
  aiGeneratedTitle: null,
  requestedTargetTicketId: null,
  ticketId: null,
  rejectionReason: null,
  reviewedBy: null,
  reviewedAt: null,
  createdAt: timestamp,
  submittedAt: timestamp,
  updatedAt: timestamp,
  cancelledAt: null,
  latestAiRun: null,
};

function open(element: ReactNode) {
  return render(<LiveSessionProvider>{element}</LiveSessionProvider>);
}

function installFetch(
  handle: (path: string, options: RequestInit) => Response | Promise<Response>,
) {
  const fetch = vi.fn(async (path: string, options: RequestInit) => {
    if (path === "/api/v1/me")
      return Response.json({
        id: "reporter",
        username: "reporter",
        roles: ["REPORTER"],
        isActive: true,
      });
    if (path === "/api/v1/public/master-data")
      return Response.json({
        categories: [],
        departments: [],
        locations: [
          {
            id: location.locationId,
            name: location.locationName,
            lat: location.lat,
            lng: location.lng,
            isActive: true,
          },
        ],
      });
    return handle(path, options);
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function list(items: ReportDetail[], page = 1, total = items.length) {
  return Response.json({
    items,
    pagination: { page, pageSize: 25, totalItems: total, totalPages: Math.ceil(total / 25) },
    counts: { total: 42, draft: 1, pendingReview: 1, confirmed: 30, rejected: 5, cancelled: 5 },
  });
}

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  mocks.prototype.user = null;
  mocks.prototype.state = null;
  mocks.prototype.demoAvailable = false;
  mocks.prototype.dispatch.mockReset();
});

it("stages an original image in live mode and saves its returned ID on a new draft", async () => {
  const stage = Promise.withResolvers<Response>();
  const fetch = installFetch((path, options) => {
    if (path === "/api/v1/media/report-images") {
      expect(options.body).toBeInstanceOf(FormData);
      expect((options.body as FormData).get("file")).toMatchObject({
        name: "original.png",
        size: 8,
      });
      return stage.promise;
    }
    expect(path).toBe("/api/v1/reports/drafts");
    expect(JSON.parse(options.body as string)).toMatchObject({
      imageIds: ["image-id"],
      locationId: "location-id",
      description: "Draft notes",
    });
    return Response.json({ ...pending, status: "DRAFT", reportNumber: null }, { status: 201 });
  });
  open(<CreateReportScreen />);
  fireEvent.click(await screen.findByRole("button", { name: "Campus Gate" }));
  expect(screen.queryByText("เพิ่มรูปตัวอย่างจำลอง")).toBeNull();
  fireEvent.change(screen.getByLabelText("รายละเอียดปัญหา"), { target: { value: "Draft notes" } });
  fireEvent.change(screen.getByLabelText("รูปภาพประกอบ"), {
    target: { files: [new File(["original"], "original.png", { type: "image/png" })] },
  });
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "บันทึกฉบับร่าง" }).disabled).toBe(true);
  stage.resolve(
    Response.json({ ...image, imageId: image.id, expiresAt: timestamp }, { status: 201 }),
  );
  await screen.findByText("แนบแล้ว 1 / 5 ภาพ");
  expect(screen.getByAltText(image.fileName).getAttribute("src")).toBe(image.previewUrl);
  fireEvent.click(screen.getByRole("button", { name: "บันทึกฉบับร่าง" }));
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/my-reports"));
  expect(fetch).toHaveBeenCalledWith(
    "/api/v1/reports/drafts",
    expect.objectContaining({ method: "POST" }),
  );
  expect(mocks.prototype.dispatch).not.toHaveBeenCalled();
});

it("loads, updates, and submits a saved live draft with server attachment IDs", async () => {
  const draft = { ...pending, status: "DRAFT", reportNumber: null };
  const fetch = installFetch((path, options) => {
    if (path === reportURL) return Response.json(draft);
    expect([reportURL + "/draft", reportURL + "/submit"]).toContain(path);
    expect(JSON.parse(options.body as string)).toMatchObject({
      imageIds: ["image-id"],
      locationName: "Campus Gate",
    });
    return Response.json(path.endsWith("/draft") ? draft : pending);
  });
  const first = open(<CreateReportScreen draftId="report-id" />);
  await screen.findByRole("button", { name: "Campus Gate" });
  expect(screen.getByDisplayValue("Broken walkway")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "บันทึกฉบับร่าง" }));
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledTimes(1));
  first.unmount();
  open(<CreateReportScreen draftId="report-id" />);
  await screen.findByRole("button", { name: "Campus Gate" });
  fireEvent.click(screen.getByRole("button", { name: "ส่งรายงาน" }));
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledTimes(2));
  expect(fetch).toHaveBeenCalledWith(
    reportURL + "/draft",
    expect.objectContaining({ method: "PATCH" }),
  );
  expect(fetch).toHaveBeenCalledWith(
    reportURL + "/submit",
    expect.objectContaining({ method: "POST" }),
  );
});

it("looks up a pending edit by report number, reports transition errors, and saves an incremented version", async () => {
  let attempts = 0;
  installFetch((path, options) => {
    if (path === "/api/v1/my-reports?reportNumber=" + number) return list([pending]);
    expect(path).toBe(reportURL);
    if (options.method !== "PATCH") return Response.json(pending);
    expect(JSON.parse(options.body as string)).toMatchObject({
      description: "Updated",
      imageIds: [image.id],
    });
    if (++attempts === 1)
      return Response.json({ error: { code: "TRANSITION_FORBIDDEN" } }, { status: 409 });
    return Response.json({ ...pending, description: "Updated", version: 2 });
  });
  open(<EditPendingReportScreen reportNumber={number} />);
  await screen.findByText(number + " · เวอร์ชัน 1");
  await screen.findByRole("button", { name: "Campus Gate" });
  fireEvent.change(screen.getByLabelText("รายละเอียดปัญหา"), { target: { value: "Updated" } });
  fireEvent.click(screen.getByRole("button", { name: "บันทึกการแก้ไข" }));
  expect(await screen.findByText(/สถานะรายงานเปลี่ยนแล้ว/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "บันทึกการแก้ไข" }));
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/my-reports"));
});

it("uses server counts, debounced search and pagination, then refreshes after cancellation", async () => {
  let cancelled = false;
  const fetch = installFetch((path, options) => {
    if (path === reportURL + "/cancel") {
      expect(options.method).toBe("POST");
      expect(options.body).toBe("{}");
      cancelled = true;
      return Response.json({ ...pending, status: "CANCELLED" });
    }
    const query = new URL(path, "http://localhost").searchParams;
    const page = Number(query.get("page"));
    if (cancelled && query.get("status") === "PENDING_REVIEW") return list([], page);
    return list(
      [
        {
          ...pending,
          version: 2,
          status: cancelled ? "CANCELLED" : "PENDING_REVIEW",
          cancelledAt: cancelled ? timestamp : null,
        },
      ],
      page,
      26,
    );
  });
  open(<MyReportsScreen />);
  await screen.findByText("Broken walkway");
  expect(screen.getByText("42")).toBeTruthy();
  expect(screen.getByText(/เวอร์ชัน 2/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "หน้าถัดไป" }));
  await waitFor(() =>
    expect(fetch).toHaveBeenCalledWith("/api/v1/my-reports?page=2&pageSize=25", expect.anything()),
  );
  fireEvent.change(screen.getByRole("searchbox", { name: "ค้นหารายงาน" }), {
    target: { value: "gate" },
  });
  await waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/my-reports?page=1&pageSize=25&q=gate",
      expect.anything(),
    ),
  );
  const status = screen.getByRole("combobox", { name: "สถานะรายงาน" });
  fireEvent.keyDown(status, { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: "รอการตรวจสอบ" }));
  await waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/my-reports?page=1&pageSize=25&q=gate&status=PENDING_REVIEW",
      expect.anything(),
    ),
  );
  await waitFor(() =>
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "ยกเลิกรายงาน" }).disabled).toBe(
      false,
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "ยกเลิกรายงาน" }));
  const dialog = await screen.findByRole("alertdialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "ยืนยันยกเลิกรายงาน" }));
  await screen.findByText("ไม่พบรายงานที่ตรงกับตัวกรอง");
  fireEvent.click(screen.getByRole("button", { name: "ล้างตัวกรอง" }));
  await screen.findByText(/ยกเลิกเมื่อ/);
  expect(screen.queryByRole("button", { name: "ยกเลิกรายงาน" })).toBeNull();
});

it("keeps draft saves in the development guest prototype", async () => {
  mocks.prototype.user = { id: "demo", roles: ["REPORTER"] };
  mocks.prototype.state = { reports: [], tickets: [], locations: [] };
  mocks.prototype.demoAvailable = true;
  mocks.prototype.dispatch.mockResolvedValue({ ok: true, data: "local-draft" });
  const fetch = vi.fn(async () => new Response(null, { status: 401 }));
  vi.stubGlobal("fetch", fetch);
  open(<CreateReportScreen />);
  await screen.findByRole("button", { name: "เพิ่มรูปตัวอย่างจำลอง" });
  fireEvent.click(screen.getByRole("button", { name: "บันทึกฉบับร่าง" }));
  await screen.findByText("ดูฉบับร่างในรายงานของฉัน");
  expect(mocks.prototype.dispatch).toHaveBeenCalledWith(
    expect.objectContaining({ type: "saveReport", draft: true }),
  );
  expect(fetch.mock.calls).toHaveLength(1);
});

it("keeps the form usable when staging rejects an image", async () => {
  installFetch((path) => {
    expect(path).toBe("/api/v1/media/report-images");
    return Response.json({ error: { code: "INVALID_MEDIA_FORMAT" } }, { status: 400 });
  });
  open(<CreateReportScreen />);
  await screen.findByRole("button", { name: "Campus Gate" });
  fireEvent.change(screen.getByLabelText("รูปภาพประกอบ"), {
    target: { files: [new File(["invalid"], "broken.png", { type: "image/png" })] },
  });
  expect(await screen.findByText(/ไฟล์ภาพใช้ไม่ได้/)).toBeTruthy();
  expect(screen.getByText("แนบแล้ว 0 / 5 ภาพ")).toBeTruthy();
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "บันทึกฉบับร่าง" }).disabled).toBe(
    false,
  );
});
