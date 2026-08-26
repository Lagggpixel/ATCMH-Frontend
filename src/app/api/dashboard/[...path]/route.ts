import {
  legacyDashboardSessionCookie,
  loopbackSessionCookie,
  sessionCookie,
} from "@/src/lib/central-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const hopByHop = new Set([
  "connection", "content-encoding", "content-length", "keep-alive", "proxy-authenticate",
  "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade",
]);

function backendOrigin() {
  const value = process.env.DASHBOARD_API_URL;
  if (!value) throw new Error("DASHBOARD_API_URL is required");
  const url = new URL(value);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) {
    throw new Error("DASHBOARD_API_URL must be HTTPS or exact loopback HTTP");
  }
  return url.origin;
}

function frontendOrigin() {
  return new URL(process.env.FRONTEND_PUBLIC_ORIGIN ?? "http://localhost:3000").origin;
}

function oneSessionCookie(header: string | null) {
  const values = new Map<string, string>();
  for (const part of (header ?? "").split(";")) {
    const [name, ...raw] = part.trim().split("=");
    if (name) values.set(name, raw.join("="));
  }
  for (const name of [sessionCookie, loopbackSessionCookie, legacyDashboardSessionCookie]) {
    const value = values.get(name);
    if (value) return `${name}=${value}`;
  }
  return undefined;
}

async function proxy(request: Request, context: {params: Promise<{path: string[]}>}) {
  const {path} = await context.params;
  const incoming = new URL(request.url);
  const target = new URL(`/${path.map(encodeURIComponent).join("/")}${incoming.search}`, backendOrigin());
  const headers = new Headers();
  for (const name of ["accept", "content-type", "if-none-match", "range", "x-csrf-token"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const cookie = oneSessionCookie(request.headers.get("cookie"));
  if (cookie) headers.set("cookie", cookie);
  headers.set("origin", frontendOrigin());
  const method = request.method.toUpperCase();
  const upstream = await fetch(target, {
    method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer(),
    cache: "no-store",
    redirect: "manual",
  });
  const responseHeaders = new Headers();
  upstream.headers.forEach((value, name) => {
    if (!hopByHop.has(name.toLowerCase()) && name.toLowerCase() !== "set-cookie") responseHeaders.append(name, value);
  });
  const setCookies = (upstream.headers as Headers & {getSetCookie?: () => string[]}).getSetCookie?.()
    ?? (upstream.headers.get("set-cookie") ? [upstream.headers.get("set-cookie")!] : []);
  for (const value of setCookies) responseHeaders.append("set-cookie", value);
  return new Response(upstream.body, {status: upstream.status, statusText: upstream.statusText, headers: responseHeaders});
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
