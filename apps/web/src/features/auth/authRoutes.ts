import { isExclusiveAdmin } from "@/lib/domain/permissions";
import type { User } from "@/types/domain";

export const publicFeedPath = "/feed";
export const signInPath = "/login";
export const accountChooserPath = "/login/select-account";
export const googleSignInLabel = "เข้าสู่ระบบด้วยบัญชี Google (@ku.th)";

export function isAuthPortal(path: string) {
  return path === "/" || path === signInPath || path === accountChooserPath;
}

export function safeReturnPath(next: string | undefined) {
  if (!next?.startsWith("/") || /[\\\u0000-\u001f\u007f]/.test(next)) return;
  const origin = "https://kuspot.invalid";
  const candidate = URL.parse(next, origin);
  if (!candidate || candidate.origin !== origin) return;
  try {
    const path = decodeURIComponent(candidate.pathname);
    if (
      path.startsWith("//") ||
      /[\\\u0000-\u001f\u007f]/.test(path) ||
      isAuthPortal(path.replace(/\/+$/, "") || "/")
    )
      return;
  } catch {
    return;
  }
  return candidate.pathname + candidate.search + candidate.hash;
}

export function authLink(path: typeof signInPath | typeof accountChooserPath, next?: string) {
  const returnPath = safeReturnPath(next);
  return returnPath ? `${path}?next=${encodeURIComponent(returnPath)}` : path;
}

export function signedInDestination(user: Pick<User, "roles">, next?: string) {
  return safeReturnPath(next) ?? (isExclusiveAdmin(user) ? "/admin" : publicFeedPath);
}
