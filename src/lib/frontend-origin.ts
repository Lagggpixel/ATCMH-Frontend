export function parseFrontendPublicOrigin(configured: string): URL {
  if (configured.includes("?") || configured.includes("#")) {
    throw new Error("FRONTEND_PUBLIC_ORIGIN must contain only an origin.");
  }
  const url = new URL(configured);
  if (url.username || url.password) throw new Error("FRONTEND_PUBLIC_ORIGIN must not include credentials.");
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("FRONTEND_PUBLIC_ORIGIN must contain only an origin.");
  }
  const isLoopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback)) {
    throw new Error("FRONTEND_PUBLIC_ORIGIN must use HTTPS, except on loopback.");
  }
  return new URL(url.origin);
}
