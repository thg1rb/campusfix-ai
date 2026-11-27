export function readinessURL(): URL {
  try {
    const url = new URL(process.env.API_BASE_URL ?? "");
    if (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    ) {
      return new URL("readyz", url.href.endsWith("/") ? url : url.href + "/");
    }
  } catch {
    // Report a configuration error without including the input.
  }
  throw new Error("API_BASE_URL must be a valid HTTP(S) base URL");
}
