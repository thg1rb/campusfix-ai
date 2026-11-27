import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api/client";
import { getLoginUrl, listAdminUsers, updateAdminUser } from "@/lib/api/identity";
import { GET, POST, PUT, PATCH, DELETE } from "@/app/api/v1/[...path]/route";
import { GET as startLogin } from "@/app/login/start/route";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("identity API client", () => {
  it("keeps typed errors and sends same-origin credentials", async () => {
    const fetch = vi.fn(async () =>
      Response.json(
        {
          error: {
            code: "USERNAME_TAKEN",
            message: "Taken",
            details: { field: "username" },
            requestId: "request-1",
          },
        },
        { status: 409 },
      ),
    );
    vi.stubGlobal("fetch", fetch);
    await expect(
      apiFetch("/me/username", { method: "PATCH", body: '{"username":"existing"}' }),
    ).rejects.toMatchObject({
      name: "ApiError",
      status: 409,
      code: "USERNAME_TAKEN",
      requestId: "request-1",
      details: { field: "username" },
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/me/username",
      expect.objectContaining({ credentials: "include", method: "PATCH" }),
    );
  });

  it("serializes false filters, null departments, and return paths", async () => {
    const fetch = vi.fn(async () => Response.json({}));
    vi.stubGlobal("fetch", fetch);
    await listAdminUsers({ isActive: false, role: "REPORTER", page: 2 });
    expect(fetch.mock.calls[0]).toEqual(
      expect.arrayContaining(["/api/v1/admin/users?isActive=false&role=REPORTER&page=2"]),
    );
    await updateAdminUser("id", { departmentId: null, isActive: false });
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/v1/admin/users/id",
      expect.objectContaining({ body: '{"departmentId":null,"isActive":false}' }),
    );
    expect(
      new URL(getLoginUrl("/feed?q=lamp#top"), "http://localhost").searchParams.get("next"),
    ).toBe("/feed?q=lamp#top");
  });
});

describe("runtime API proxy", () => {
  it.each(Object.entries({ GET, POST, PUT, PATCH, DELETE }))(
    "relays %s and preserves multiple cookies",
    async (method, handler) => {
      vi.stubEnv("API_BASE_URL", "http://api.internal:8080/");
      const headers = new Headers({
        Location: "https://accounts.google.com/",
        "Content-Type": "text/plain",
      });
      headers.append("Set-Cookie", "oauth=; Expires=Thu, 01 Jan 1970 00:00:00 GMT");
      headers.append("Set-Cookie", "ku_spot_session=opaque; HttpOnly");
      const fetch = vi.fn(async (url: URL, init: RequestInit) => {
        expect(url.href).toBe("http://api.internal:8080/api/v1/auth/callback?q=a%20b");
        expect(init.redirect).toBe("manual");
        expect(init.method).toBe(method);
        expect(new Headers(init.headers).get("Cookie")).toBe("oauth=signed");
        if (method !== "GET") expect(await new Response(init.body).text()).toBe("data");
        return new Response("redirect", { status: 302, headers });
      });
      vi.stubGlobal("fetch", fetch);
      const request = new Request("http://localhost:3000/api/v1/auth/callback?q=a%20b", {
        method,
        headers: { Cookie: "oauth=signed" },
        body: method === "GET" ? undefined : "data",
      });
      const response = await handler(request, {
        params: Promise.resolve({ path: ["auth", "callback"] }),
      });
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("https://accounts.google.com/");
      expect(response.headers.getSetCookie()).toEqual(headers.getSetCookie());
      expect(await response.text()).toBe("redirect");
      expect(fetch).toHaveBeenCalledOnce();
    },
  );

  it("returns a JSON 503 for the API and a login notice redirect for the browser", async () => {
    vi.stubEnv("API_BASE_URL", "");
    const api = await GET(new Request("http://localhost/api/v1/auth/login"), {
      params: Promise.resolve({ path: ["auth", "login"] }),
    });
    expect(api.status).toBe(503);
    expect(await api.json()).toMatchObject({ error: { code: "SERVICE_UNAVAILABLE" } });
    const browser = await startLogin(new Request("http://localhost/login/start?next=%2Ffeed"));
    expect(browser.status).toBe(303);
    expect(browser.headers.get("Location")).toBe("/login?error=SERVICE_UNAVAILABLE&next=%2Ffeed");
  });
});
