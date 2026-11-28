import { apiFetch } from "./client";

const imagePath = "/media/report-images";

export type StagedReportImage = {
  imageId: string;
  fileName: string;
  mimeType: "image/png" | "image/jpeg";
  sizeBytes: number;
  previewUrl: string;
  expiresAt: string;
};

export function uploadReportImage(file: File, signal?: AbortSignal): Promise<StagedReportImage> {
  const body = new FormData();
  body.append("file", file);
  return apiFetch<StagedReportImage>(imagePath, { method: "POST", body, signal });
}

export function reportImagePreviewUrl(imageId: string): string {
  return "/api/v1" + imagePath + "/" + encodeURIComponent(imageId);
}
