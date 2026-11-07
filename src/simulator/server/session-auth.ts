import {createHash} from "node:crypto";
import {allowedMutationOrigins} from "../../lib/browser-session";
import {csrfMatches, introspectCentralSessionOrThrow, sessionTokenFromCookieHeader, sessionCookie, loopbackSessionCookie} from "../../lib/central-auth";
import {websiteAccessReportedHeaders} from "../../lib/website-access";
import {canAccessStaffSimulator, canAssignMentees, simulatorEnabled} from "../feature";
import {SessionError} from "../sessions";
import type {Actor} from "./session-service";

export interface MenteeAdmission {
  /** Admit a signed-in user without Sweatbox access when this resolves true for their Discord account. */
  hasAssignment?: (discordId: string) => Promise<boolean>;
  /** Admit a recorded participant for read-only airport references after archiving. */
  hasReplay?: (accountId: string) => Promise<boolean>;
  /** Admit any signed-in user; the caller limits what they can see (their own assignments, a code they hold). */
  anySignedIn?: boolean;
}

type CentralSession = NonNullable<Awaited<ReturnType<typeof introspectCentralSessionOrThrow>>>;
type AdminAnswer = Awaited<ReturnType<Response["json"]>> | null;
interface VerifiedAccess {session: CentralSession; user: AdminAnswer; expiresAt: number}
/** How long a confirmed sign-in and role answer is reused, so live commands do not each wait on the backend. */
export const ACCESS_CACHE_MS = 15_000;
const accessCacheMs = () => {const value = Number(process.env.SWEATBOX_ACCESS_CACHE_MS ?? ACCESS_CACHE_MS); return Number.isFinite(value) && value > 0 ? Math.min(value, 60_000) : 0;};
const ACCESS_CACHE_LIMIT = 500;
const accessCache = new Map<string, VerifiedAccess>();
const cacheKey = (name: string, token: string) => createHash("sha256").update(`${name}:${token}`).digest("base64url");
export function clearSessionAccessCache() {accessCache.clear();}
function cachedAccess(key: string, now: number) {
  const entry = accessCache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt > now && Date.parse(entry.session.expiresAt) > now) return entry;
  accessCache.delete(key);
}
function rememberAccess(key: string, access: VerifiedAccess) {
  accessCache.delete(key);
  accessCache.set(key, access);
  // Drop the oldest entries first; Map keeps insertion order.
  while (accessCache.size > ACCESS_CACHE_LIMIT) accessCache.delete(accessCache.keys().next().value!);
}

export async function authorizeSessionRequest(request: Request, staff: boolean, admission: MenteeAdmission = {}): Promise<Actor> {
  if (!simulatorEnabled({SIMULATOR_ENABLED: process.env.SIMULATOR_ENABLED})) throw new SessionError("not-found", "Sweatbox unavailable.", 404);
  const token = sessionTokenFromCookieHeader(request.headers.get("cookie"));
  if (!token) throw new SessionError("unauthorized", "Sign in to join this session.", 401);
  if (request.method !== "GET" && (!allowedMutationOrigins().has(request.headers.get("origin") ?? "") || !csrfMatches(token, request.headers.get("x-csrf-token"))))
    throw new SessionError("forbidden", "Your sign-in could not be verified. Refresh and try again.", 403);
  // Both training seats require an allowed role; a code/link is not an access grant.
  const api = process.env.DASHBOARD_API_URL, origin = process.env.FRONTEND_PUBLIC_ORIGIN;
  if (!api || !origin) throw new SessionError("unavailable", "Sweatbox access verification is unavailable.", 503);
  const name = request.headers.get("cookie")?.includes(`${sessionCookie}=`) ? sessionCookie : loopbackSessionCookie;
  const key = cacheKey(name, token), now = Date.now();
  let session: CentralSession | undefined, user: AdminAnswer;
  const cacheMs = accessCacheMs(), cached = cacheMs ? cachedAccess(key, now) : undefined;
  if (cached) ({session, user} = cached);
  else {
    const controller = new AbortController();
    const signal = AbortSignal.any([request.signal, controller.signal, AbortSignal.timeout(8000)]);
    try {
      // The two checks are independent. Bound both, including response bodies, so a
      // slow introspection cannot outlive the browser's refresh and pile up work.
      // An outage or timeout is "try again" (503), never "signed out" (401): the
      // live session must show Reconnecting instead of ending for everyone.
      [session, user] = await Promise.all([
        introspectCentralSessionOrThrow(token, undefined, (input, init) => fetch(input, {...init, signal})),
        fetch(new URL("/admin/me", api), {headers: {...websiteAccessReportedHeaders(), cookie: `${name}=${token}`, origin}, cache: "no-store", signal})
          .then(async response => {
            if (response.status >= 500 || response.status === 408 || response.status === 429) throw new Error("Access verification unavailable");
            return response.ok ? response.json() : null;
          }),
      ]);
      signal.throwIfAborted();
    } catch {
      throw new SessionError("unavailable", "Sweatbox access verification is temporarily unavailable. Try again.", 503);
    } finally {controller.abort();}
    // Only a confirmed sign-in is reused; signed-out answers are always checked again.
    if (session && cacheMs) rememberAccess(key, {session, user, expiresAt: now + cacheMs});
  }
  if (!session) throw new SessionError("unauthorized", "Your sign-in has expired. Sign in again to continue.", 401);
  const displayName = session.displayName || session.discordDisplayName || (typeof user?.username === "string" ? user.username : undefined);
  const actor: Actor = {accountId: session.accountId, staff, ...(displayName ? {displayName: displayName.slice(0, 128)} : {}), ...(session.discordId ? {discordId: session.discordId} : {})};
  if (canAccessStaffSimulator(user)) return {...actor, ...(canAssignMentees(user) ? {canAssign: true} : {}), ...(user?.role === "super_admin" ? {superAdmin: true} : {})};
  const denied = new SessionError("forbidden", "Sweatbox access is limited to staff, administrators, Sweatbox Testers and assigned mentees.", 403);
  if (staff || !session.discordId) throw denied;
  if (admission.anySignedIn) return {...actor, simulatorAccess: false};
  let assigned = false;
  try {
    assigned = !!(await admission.hasAssignment?.(session.discordId));
    if (!assigned && request.method === "GET") assigned = !!(await admission.hasReplay?.(session.accountId));
  } catch {throw new SessionError("unavailable", "Sweatbox access verification is temporarily unavailable. Try again.", 503);}
  if (!assigned) throw denied;
  return {...actor, simulatorAccess: false};
}
