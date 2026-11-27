export function apiURL(path: string): URL {
  try {
    const url = new URL(process.env.API_BASE_URL ?? "");
    if (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    ) {
      return new URL(path, url.href.endsWith("/") ? url : url.href + "/");
    }
  } catch {
    // Report configuration errors without including the input.
  }
  throw new Error("API_BASE_URL must be a valid HTTP(S) base URL");
}

export function readinessURL(): URL {
  return apiURL("readyz");
}
