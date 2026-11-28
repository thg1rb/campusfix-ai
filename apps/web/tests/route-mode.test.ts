import { expect, it } from "vitest";
import { getRouteMode } from "@/components/shared/routeMode";

it.each([
  ["/", "login"],
  ["/login/", "login"],
  ["/login/select-account", "demo-login"],
  ["/admin", "live"],
  ["/admin/users", "live"],
  ["/settings/profile", "live"],
  ["/admin/categories", "live"],
  ["/admin/departments", "live"],
  ["/admin/locations", "live"],
  ["/reports/new", "live"],
  ["/my-reports", "live"],
  ["/my-reports/RPT-2026-00001/edit", "live"],
  ["/reviewer/reports/item", "prototype-only"],
  ["/department/analytics", "prototype-only"],
  ["/feed", "prototype-public"],
  ["/reports/record", "prototype-public"],
  ["/u/account", "prototype-public"],
  ["/reports/new-record", "prototype-public"],
  ["/departmental", "other"],
])("classifies %s as %s", (path, mode) => expect(getRouteMode(path)).toBe(mode));
