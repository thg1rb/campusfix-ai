export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { readinessURL } = await import("./lib/api/config");
    readinessURL();
  }
}
