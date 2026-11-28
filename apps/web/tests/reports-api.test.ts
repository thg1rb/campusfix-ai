import { afterEach, expect, it, vi } from "vitest";
import {
  cancelPendingReport,
  createAndSubmitReport,
  createDraftReport,
  editPendingReport,
  getReport,
  listMyReports,
  submitDraftReport,
  updateDraftReport,
} from "@/lib/api/reports";

afterEach(() => vi.unstubAllGlobals());

it("calls all Reporter endpoints with same-origin credentials, typed options, and JSON writes", async () => {
  const fetch = vi.fn(async () => Response.json({ status: "DRAFT" }));
  vi.stubGlobal("fetch", fetch);
  const signal = new AbortController().signal;
  const fields = {
    description: "Issue",
    locationName: "Gate",
    lat: 13.85,
    lng: 100.56,
    imageIds: ["image-1"],
  };
  const cases = [
    [
      () =>
        listMyReports(
          {
            q: "campus gate",
            reportNumber: "RPT-2026-00001",
            status: "DRAFT",
            page: 2,
            pageSize: 50,
          },
          signal,
        ),
      "/my-reports?q=campus+gate&reportNumber=RPT-2026-00001&status=DRAFT&page=2&pageSize=50",
    ],
    [() => getReport("id/with/slash", signal), "/reports/id%2Fwith%2Fslash"],
    [() => createDraftReport({}), "/reports/drafts", "POST", {}],
    [
      () => updateDraftReport("id", { imageIds: [] }),
      "/reports/id/draft",
      "PATCH",
      { imageIds: [] },
    ],
    [() => createAndSubmitReport(fields), "/reports", "POST", fields],
    [() => submitDraftReport("id"), "/reports/id/submit", "POST", {}],
    [() => editPendingReport("id", fields), "/reports/id", "PATCH", fields],
    [() => cancelPendingReport("id"), "/reports/id/cancel", "POST", {}],
  ] as const;
  for (const [call, path, method, body] of cases) {
    await call();
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/v1" + path,
      expect.objectContaining({
        credentials: "include",
        cache: "no-store",
        ...(method
          ? { method, body: JSON.stringify(body), headers: expect.any(Headers) }
          : { signal }),
      }),
    );
  }
});
