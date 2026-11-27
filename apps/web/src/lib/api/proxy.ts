import { apiURL } from "./config";

const requestHeaders = [
  "accept",
  "content-type",
  "cookie",
  "origin",
  "referer",
  "sec-fetch-site",
  "if-match",
  "if-none-match",
  "range",
];
const strippedResponseHeaders = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "content-encoding",
  "content-length",
  "set-cookie",
]);

function proxyError(status: number, code: string, message: string, requestId: string) {
  return Response.json(
    { error: { code, message, details: {}, requestId } },
    { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } },
  );
}

export async function proxyAPI(request: Request, path: string[]) {
  const supplied = request.headers.get("x-request-id");
  const requestId =
    supplied && /^[A-Za-z0-9._-]{1,64}$/.test(supplied) ? supplied : crypto.randomUUID();
  if (
    path.some(
      (part) => !part || part === "." || part === ".." || /[/\\\u0000-\u001f\u007f]/.test(part),
    )
  ) {
    return proxyError(400, "INVALID_REQUEST", "The request path is invalid.", requestId);
  }

  try {
    const target = apiURL("api/v1/" + path.map(encodeURIComponent).join("/"));
    target.search = new URL(request.url).search;
    const headers = new Headers({ "X-Request-Id": requestId });
    for (const name of requestHeaders) {
      const value = request.headers.get(name);
      if (value !== null) headers.set(name, value);
    }

    const options: RequestInit & { duplex?: "half" } = {
      method: request.method,
      headers,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]),
    };
    if (request.body && request.method !== "GET" && request.method !== "HEAD") {
      options.body = request.body;
      options.duplex = "half";
    }
    const upstream = await fetch(target, options);
    const responseHeaders = new Headers();
    const connectionHeaders = new Set(
      (upstream.headers.get("connection") ?? "")
        .split(",")
        .map((name) => name.trim().toLowerCase()),
    );
    for (const [name, value] of upstream.headers) {
      if (!strippedResponseHeaders.has(name) && !connectionHeaders.has(name)) {
        responseHeaders.append(name, value);
      }
    }
    for (const cookie of upstream.headers.getSetCookie())
      responseHeaders.append("Set-Cookie", cookie);
    if (!responseHeaders.has("Cache-Control")) responseHeaders.set("Cache-Control", "no-store");
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    const message = timedOut ? "Upstream request timed out." : "Upstream request failed.";
    console.error("[api-proxy]", { requestId, path: path.join("/"), message });
    return proxyError(
      503,
      "SERVICE_UNAVAILABLE",
      "The service is temporarily unavailable.",
      requestId,
    );
  }
}
