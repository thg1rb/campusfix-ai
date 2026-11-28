import type { Report, ReportStatus } from "@/types/domain";
import { apiFetch, queryString, type PageQuery, type PageResult } from "./client";

export type ReportImageAttachment = {
  id: string;
  fileName: string;
  mimeType: "image/png" | "image/jpeg";
  sizeBytes: number;
  sortOrder: number;
  previewUrl: string;
};

export type ReportDetail = Omit<Report, "images" | "location"> & {
  images: ReportImageAttachment[];
  location: {
    locationId: string | null;
    locationName: string | null;
    detailNote: string | null;
    lat: number | null;
    lng: number | null;
  } | null;
  latestAiRun: null;
};

export type ReportCounts = {
  total: number;
  draft: number;
  pendingReview: number;
  confirmed: number;
  rejected: number;
  cancelled: number;
};

export type MyReportsFilters = PageQuery & {
  status?: ReportStatus;
  q?: string;
  reportNumber?: string;
};
export type PaginatedMyReports = PageResult<ReportDetail> & { counts: ReportCounts };

export type SaveDraftRequest = {
  description?: string;
  locationId?: string | null;
  locationName?: string | null;
  locationDetailNote?: string | null;
  lat?: number | null;
  lng?: number | null;
  imageIds?: string[];
};

export type EditPendingReportRequest = SaveDraftRequest & {
  description: string;
  locationName: string;
  lat: number;
  lng: number;
};

export type SubmitReportRequest = EditPendingReportRequest & { imageIds: string[] };

const reportPath = (id: string) => "/reports/" + encodeURIComponent(id);

export function listMyReports(filters: MyReportsFilters, signal?: AbortSignal) {
  return apiFetch<PaginatedMyReports>("/my-reports" + queryString(filters), { signal });
}

export function getReport(id: string, signal?: AbortSignal) {
  return apiFetch<ReportDetail>(reportPath(id), { signal });
}

function write(path: string, method: "POST" | "PATCH", input: SaveDraftRequest) {
  return apiFetch<ReportDetail>(path, { method, body: JSON.stringify(input) });
}

export function createDraftReport(input: SaveDraftRequest) {
  return write("/reports/drafts", "POST", input);
}

export function updateDraftReport(id: string, input: SaveDraftRequest) {
  return write(reportPath(id) + "/draft", "PATCH", input);
}

export function createAndSubmitReport(input: SubmitReportRequest) {
  return write("/reports", "POST", input);
}

export function submitDraftReport(id: string, input: SaveDraftRequest = {}) {
  return write(reportPath(id) + "/submit", "POST", input);
}

export function editPendingReport(id: string, input: EditPendingReportRequest) {
  return write(reportPath(id), "PATCH", input);
}

export function cancelPendingReport(id: string) {
  return write(reportPath(id) + "/cancel", "POST", {});
}
