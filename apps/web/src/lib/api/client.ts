interface ErrorData {
  code: string;
  message: string;
  details: Record<string, unknown>;
  requestId: string | null;
}

export class ApiError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown>;
  readonly requestId: string | null;

  constructor(
    readonly status: number,
    data: ErrorData,
  ) {
    super(data.message);
    this.name = "ApiError";
    this.code = data.code;
    this.details = data.details;
    this.requestId = data.requestId;
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (typeof options.body === "string") headers.set("Content-Type", "application/json");
  const response = await fetch("/api/v1" + path, {
    ...options,
    headers,
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const error = body?.error;
    throw new ApiError(response.status, {
      code: typeof error?.code === "string" ? error.code : "HTTP_ERROR",
      message: typeof error?.message === "string" ? error.message : "The request failed.",
      details: error?.details && typeof error.details === "object" ? error.details : {},
      requestId:
        typeof error?.requestId === "string"
          ? error.requestId
          : response.headers.get("X-Request-Id"),
    });
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
