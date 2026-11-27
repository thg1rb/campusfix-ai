import { proxyAPI } from "@/lib/api/proxy";

export const runtime = "nodejs";

async function proxy(request: Request, context: RouteContext<"/api/v1/[...path]">) {
  const { path } = await context.params;
  return proxyAPI(request, path);
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
