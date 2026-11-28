import { afterEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "@/app/api/v1/[...path]/route";
import { ApiError } from "@/lib/api/client";
import { reportImagePreviewUrl, uploadReportImage } from "@/lib/api/media";

const imageId = "f98d99e1-7df2-462a-9ea8-edc9cc0eeb45";
const uploadPath = "/api/v1/media/report-images";
const png = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x01);
const jpeg = Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 0x00, 0xff, 0xd9);

const staged = {
  imageId,
  fileName: "photo.png",
  mimeType: "image/png",
  sizeBytes: png.length,
  previewUrl: uploadPath + "/" + imageId,
  expiresAt: "2026-11-29T07:00:00Z",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("media API client", () => {
  it("posts FormData with credentials and lets fetch set the boundary", async () => {
    const file = new File([png], "photo.png", { type: "image/png" });
    const { signal } = new AbortController();
    const fetch = vi.fn(async (path: string, init: RequestInit) => {
      expect(path).toBe(uploadPath);
      expect(init).toMatchObject({ method: "POST", credentials: "include", signal });
      expect(new Headers(init.headers).has("Content-Type")).toBe(false);
      expect(init.body).toBeInstanceOf(FormData);
      const request = new Request("http://localhost:3000" + path, init);
      expect(request.headers.get("Content-Type")).toMatch(/^multipart\/form-data; boundary=/);
      const form = await request.formData();
      expect([...form.keys()]).toEqual(["file"]);
      const uploaded = form.get("file");
      expect(uploaded).toBeInstanceOf(File);
      expect((uploaded as File).name).toBe("photo.png");
      expect(new Uint8Array(await (uploaded as File).arrayBuffer())).toEqual(png);
      return Response.json(staged, { status: 201 });
    });
    vi.stubGlobal("fetch", fetch);
    await expect(uploadReportImage(file, signal)).resolves.toEqual(staged);
    expect(reportImagePreviewUrl(imageId)).toBe(staged.previewUrl);
    expect(reportImagePreviewUrl("../name?#")).toBe(uploadPath + "/..%2Fname%3F%23");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([
    [400, "INVALID_MEDIA_FORMAT"],
    [400, "MEDIA_TOO_LARGE"],
    [403, "ADMIN_NON_OPERATIONAL"],
    [413, "PAYLOAD_TOO_LARGE"],
  ])("maps the %d %s API envelope", async (status, code) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            error: {
              code,
              message: "Upload rejected",
              details: { field: "file" },
              requestId: "media-request",
            },
          },
          { status },
        ),
      ),
    );
    const result = uploadReportImage(new File([png], "photo.png"));
    await expect(result).rejects.toBeInstanceOf(ApiError);
    await expect(result).rejects.toMatchObject({
      status,
      code,
      message: "Upload rejected",
      details: { field: "file" },
      requestId: "media-request",
    });
  });
});

describe("runtime media proxy", () => {
  it("streams the original multipart boundary and binary body", async () => {
    vi.stubEnv("API_BASE_URL", "http://api.internal:8080/");
    const form = new FormData();
    form.append("file", new File([png], "photo.png", { type: "image/png" }));
    const request = new Request("http://localhost:3000" + uploadPath, {
      method: "POST",
      headers: {
        Cookie: "ku_spot_session=opaque",
        Origin: "http://localhost:3000",
        Referer: "http://localhost:3000/report",
        "Sec-Fetch-Site": "same-origin",
        "X-Request-Id": "media-proxy",
      },
      body: form,
    });
    const boundary = request.headers.get("Content-Type");
    const original = new Uint8Array(await request.clone().arrayBuffer());
    const fetch = vi.fn(async (url: URL, init: RequestInit & { duplex?: string }) => {
      const headers = new Headers(init.headers);
      expect(url.href).toBe("http://api.internal:8080" + uploadPath);
      expect(init).toMatchObject({ method: "POST", duplex: "half" });
      expect(init.body).toBeInstanceOf(ReadableStream);
      expect(headers.get("Content-Type")).toBe(boundary);
      expect(headers.get("Cookie")).toBe("ku_spot_session=opaque");
      expect(headers.get("Origin")).toBe("http://localhost:3000");
      expect(headers.get("Referer")).toBe("http://localhost:3000/report");
      expect(headers.get("Sec-Fetch-Site")).toBe("same-origin");
      expect(headers.get("X-Request-Id")).toBe("media-proxy");
      expect(new Uint8Array(await new Response(init.body).arrayBuffer())).toEqual(original);
      return Response.json(staged, { status: 201 });
    });
    vi.stubGlobal("fetch", fetch);
    const response = await POST(request, {
      params: Promise.resolve({ path: ["media", "report-images"] }),
    });
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual(staged);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([
    { mimeType: "image/png", data: png, cache: "private, no-store", fileName: "photo.png" },
    {
      mimeType: "image/jpeg",
      data: jpeg,
      cache: "public, max-age=3600, immutable",
      fileName: "photo.jpg",
    },
  ])(
    "streams $mimeType with image response headers",
    async ({ mimeType, data, cache, fileName }) => {
      vi.stubEnv("API_BASE_URL", "http://api.internal:8080/");
      const path = reportImagePreviewUrl(imageId);
      const disposition = 'inline; filename="' + fileName + '"';
      const fetch = vi.fn(async (url: URL, init: RequestInit) => {
        expect(url.href).toBe("http://api.internal:8080" + path);
        expect(init.body).toBeUndefined();
        return new Response(data, {
          headers: {
            "Content-Type": mimeType,
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": disposition,
            "Cache-Control": cache,
            "X-Request-Id": "preview-proxy",
          },
        });
      });
      vi.stubGlobal("fetch", fetch);
      const response = await GET(new Request("http://localhost:3000" + path), {
        params: Promise.resolve({ path: ["media", "report-images", imageId] }),
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe(mimeType);
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(response.headers.get("Content-Disposition")).toBe(disposition);
      expect(response.headers.get("Cache-Control")).toBe(cache);
      expect(response.headers.get("X-Request-Id")).toBe("preview-proxy");
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(data);
      expect(fetch).toHaveBeenCalledOnce();
    },
  );
});
