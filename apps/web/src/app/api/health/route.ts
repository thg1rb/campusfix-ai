import { readinessURL } from "@/lib/api/config";

const headers = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    const upstream = await fetch(readinessURL(), {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
      redirect: "error",
    });
    if (upstream.status === 200 || upstream.status === 503) {
      const body = await upstream.json();
      const db = body?.checks?.db;
      const ai = body?.checks?.ai;
      const values = ["ok", "unavailable"];
      const ready = db === "ok" && ai === "ok";
      if (values.includes(db) && values.includes(ai) &&
          upstream.status === (ready ? 200 : 503)) {
        return Response.json(
          { status: ready ? "ok" : "unavailable", checks: { db, ai } },
          { status: upstream.status, headers },
        );
      }
    }
  } catch {
    // Connectivity and response failures use the same public status.
  }
  return Response.json(
    { status: "unavailable", checks: { api: "unavailable" } },
    { status: 503, headers },
  );
}
