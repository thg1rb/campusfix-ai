export type RouteMode =
  "login" | "demo-login" | "live" | "prototype-public" | "prototype-only" | "other";

const exact = new Map<string, RouteMode>([
  ["/", "login"],
  ["/login", "login"],
  ["/login/select-account", "demo-login"],
  ["/settings/profile", "live"],
  ["/reports/new", "live"],
  ["/admin", "live"],
  ["/admin/users", "live"],
  ["/admin/locations", "live"],
  ["/admin/departments", "live"],
  ["/admin/categories", "live"],
]);

const subtrees: { mode: RouteMode; paths: string[] }[] = [
  { mode: "live", paths: ["/my-reports"] },
  { mode: "prototype-only", paths: ["/reviewer", "/department"] },
  { mode: "prototype-public", paths: ["/feed", "/map", "/tickets", "/reports", "/u"] },
];

export function getRouteMode(path: string): RouteMode {
  const normalized = path.replace(/\/+$/, "") || "/";
  return (
    exact.get(normalized) ??
    subtrees.find(({ paths }) =>
      paths.some((root) => normalized === root || normalized.startsWith(root + "/")),
    )?.mode ??
    "other"
  );
}
