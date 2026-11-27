import { proxyAPI } from "@/lib/api/proxy";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const response = await proxyAPI(request, ["auth", "login"]);
  if (response.status !== 503) return response;
  await response.body?.cancel();
  const next = new URL(request.url).searchParams.get("next");
  const query = new URLSearchParams({ error: "SERVICE_UNAVAILABLE" });
  if (next) query.set("next", next);
  return new Response(null, {
    status: 303,
    headers: { Location: "/login?" + query, "Cache-Control": "no-store" },
  });
}
