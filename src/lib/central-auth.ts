import { createHmac, timingSafeEqual } from "node:crypto";

export const sessionCookie = "__Host-atcmh_session";
export const loopbackSessionCookie = "atcmh_session";
export const legacyDashboardSessionCookie = "atcmh_dashboard_session";
export const examsSessionCookie = "atcmh_exams_session";
export const sessionMaxAge = 7 * 24 * 60 * 60;
/** @deprecated retained only to clear pre-unification cookies. */
export const examsSessionMaxAge = sessionMaxAge;

export function sessionTokenFromCookieHeader(header: string | null | undefined): string | undefined {
  const values = new Map<string, string>();
  for (const part of (header ?? "").split(";")) {
    const [name, ...raw] = part.trim().split("=");
    if (name) values.set(name, decodeURIComponent(raw.join("=")));
  }
  for (const name of [sessionCookie, loopbackSessionCookie, legacyDashboardSessionCookie, examsSessionCookie]) {
    const value = values.get(name);
    if (value) return value;
  }
  return undefined;
}

export function sessionTokenFromCookieStore(store: {get(name: string): {value: string} | undefined}): string | undefined {
  for (const name of [sessionCookie, loopbackSessionCookie, legacyDashboardSessionCookie, examsSessionCookie]) {
    const value = store.get(name)?.value;
    if (value) return value;
  }
  return undefined;
}

export interface CentralAuthEnvironment {
  DASHBOARD_API_URL?: string;
  EXAMS_AUTH_KEY?: string;
  EXAMS_CSRF_SECRET?: string;
  FRONTEND_PUBLIC_ORIGIN?: string;
}

export interface CentralSession {
  accountId: string;
  discordId: string;
  discordDisplayName?: string;
  expiresAt: string;
  impersonating: boolean;
  realActorAccountId?: string;
  realActorDiscordId?: string;
}

export interface IssuedCentralSession { token: string; expiresAt: string }
type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
const PRIVATE_RETURN_ORIGIN = "https://relative.invalid";

function config(env: CentralAuthEnvironment = process.env as CentralAuthEnvironment) {
  const base = env.DASHBOARD_API_URL?.trim();
  const key = env.EXAMS_AUTH_KEY?.trim();
  const csrfSecret = env.EXAMS_CSRF_SECRET;
  const appBase = env.FRONTEND_PUBLIC_ORIGIN?.trim();
  if (!base || !key || !csrfSecret || csrfSecret.length < 32 || !appBase) {
    throw new Error("Central Exams authentication is not configured");
  }
  const backend = new URL(base);
  const application = new URL(appBase);
  if ((backend.protocol !== "https:" && backend.hostname !== "localhost")
    || (application.protocol !== "https:" && application.hostname !== "localhost")) {
    throw new Error("Central Exams authentication requires secure origins");
  }
  return { backend, application, key, csrfSecret };
}

export function safeLocalReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")
    || /[\u0000-\u001f\u007f]/.test(value)) return "/exams";
  try {
    const parsed = new URL(value, PRIVATE_RETURN_ORIGIN);
    const allowed = parsed.pathname === "/" || parsed.pathname === "/account"
      || parsed.pathname === "/apply" || parsed.pathname.startsWith("/apply?")
      || parsed.pathname === "/leaderboard" || parsed.pathname === "/dashboard"
      || parsed.pathname.startsWith("/dashboard/") || parsed.pathname === "/exams"
      || parsed.pathname.startsWith("/exams/");
    return parsed.origin === PRIVATE_RETURN_ORIGIN && allowed
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : "/exams";
  } catch { return "/exams"; }
}

export function centralLoginUrl(
  provider: "discord" | "ifc",
  returnTo: string | null | undefined,
  env: CentralAuthEnvironment = process.env as CentralAuthEnvironment,
): URL {
  const { backend } = config(env);
  const destination = safeLocalReturnTo(returnTo);
  const callback = new URL("/api/auth/callback", PRIVATE_RETURN_ORIGIN);
  callback.searchParams.set("returnTo", destination);
  const login = new URL("/auth/login", backend);
  login.searchParams.set("provider", provider);
  // Exams is a return destination, not a separate authentication audience.
  // The backend keeps its dashboard transaction slot for this shared login,
  // then the frontend exchanges the cross-origin handoff into the one WEB session.
  login.searchParams.set("app", "dashboard");
  login.searchParams.set("returnTo", `${callback.pathname}${callback.search}`);
  return login;
}

async function internalPost(path: string, body: object, env: CentralAuthEnvironment, fetchImpl: Fetch) {
  const { backend, key } = config(env);
  return fetchImpl(new URL(path, backend), {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Exams-Auth-Key": key },
    body: JSON.stringify(body),
    cache: "no-store",
  });
}

function validExpiry(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export async function exchangeCentralHandoff(
  handoff: string,
  env: CentralAuthEnvironment = process.env as CentralAuthEnvironment,
  fetchImpl: Fetch = fetch,
): Promise<IssuedCentralSession> {
  if (!handoff || handoff.length < 20) throw new Error("Invalid handoff");
  const response = await internalPost("/internal/auth/handoffs/exchange", { handoff }, env, fetchImpl);
  if (!response.ok) throw new Error("Invalid or expired handoff");
  const body = await response.json() as { token?: unknown; expiresAt?: unknown };
  if (typeof body.token !== "string" || body.token.length < 32 || !validExpiry(body.expiresAt)) {
    throw new Error("Invalid central handoff response");
  }
  return { token: body.token, expiresAt: body.expiresAt };
}

function validSession(value: unknown): CentralSession | undefined {
  if (!value || typeof value !== "object") return undefined;
  const session = value as Partial<CentralSession> & { active?: unknown };
  if (session.active !== true || typeof session.accountId !== "string"
    || !/^\d+$/.test(session.accountId) || typeof session.discordId !== "string"
    || !/^\d{15,20}$/.test(session.discordId) || !validExpiry(session.expiresAt)
    || typeof session.impersonating !== "boolean" || Date.parse(session.expiresAt) <= Date.now()) return undefined;
  const impersonation = session.impersonating === true
    && typeof session.realActorAccountId === "string" && /^\d+$/.test(session.realActorAccountId)
    && typeof session.realActorDiscordId === "string" && /^\d{15,20}$/.test(session.realActorDiscordId);
  if (session.impersonating && !impersonation) return undefined;
  return {
    accountId: session.accountId,
    discordId: session.discordId,
    ...(typeof session.discordDisplayName === "string" && session.discordDisplayName.trim()
      ? { discordDisplayName: session.discordDisplayName.trim().slice(0, 80) }
      : {}),
    expiresAt: session.expiresAt,
    impersonating: session.impersonating,
    ...(impersonation ? { realActorAccountId: session.realActorAccountId, realActorDiscordId: session.realActorDiscordId } : {}),
  };
}

export async function introspectCentralSession(
  token: string | undefined,
  env: CentralAuthEnvironment = process.env as CentralAuthEnvironment,
  fetchImpl: Fetch = fetch,
): Promise<CentralSession | undefined> {
  if (!token || token.length < 32) return undefined;
  try {
    const response = await internalPost("/internal/auth/sessions/introspect", { token }, env, fetchImpl);
    if (!response.ok) return undefined;
    return validSession(await response.json());
  } catch { return undefined; }
}

export function csrfTokenFor(token: string, env: CentralAuthEnvironment = process.env as CentralAuthEnvironment): string {
  const { csrfSecret } = config(env);
  return createHmac("sha256", csrfSecret).update(`exams-csrf:${token}`).digest("base64url");
}

export function csrfMatches(token: string, supplied: string | null, env: CentralAuthEnvironment = process.env as CentralAuthEnvironment): boolean {
  if (!supplied) return false;
  const expected = Buffer.from(csrfTokenFor(token, env));
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function logoutCentralSession(
  token: string,
  all: boolean,
  env: CentralAuthEnvironment = process.env as CentralAuthEnvironment,
  fetchImpl: Fetch = fetch,
): Promise<boolean> {
  try {
    const endpoint = all ? "/internal/auth/sessions/logout-all" : "/internal/auth/sessions/logout";
    return (await internalPost(endpoint, { token }, env, fetchImpl)).ok;
  } catch { return false; }
}
