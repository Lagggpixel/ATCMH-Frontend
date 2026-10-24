import {allowedMutationOrigins} from "../../lib/browser-session";
import {csrfMatches, introspectCentralSession, sessionTokenFromCookieHeader, sessionCookie, loopbackSessionCookie} from "../../lib/central-auth";
import {websiteAccessReportedHeaders} from "../../lib/website-access";
import {canAccessStaffSimulator, canAssignMentees, simulatorEnabled} from "../feature";
import {SessionError} from "../sessions";
import type {Actor} from "./session-service";

export interface MenteeAdmission {
  /** Admit a signed-in user without Sweatbox access when this resolves true for their Discord account. */
  hasAssignment?: (discordId: string) => Promise<boolean>;
  /** Admit any signed-in user; the caller limits what they can see (their own assignments, a code they hold). */
  anySignedIn?: boolean;
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
  const controller = new AbortController();
  const signal = AbortSignal.any([request.signal, controller.signal, AbortSignal.timeout(8000)]);
  let session, user;
  try {
    // The two checks are independent. Bound both, including response bodies, so a
    // slow introspection cannot outlive the browser's refresh and pile up work.
    [session, user] = await Promise.all([
      introspectCentralSession(token, undefined, (input, init) => fetch(input, {...init, signal})),
      fetch(new URL("/admin/me", api), {headers: {...websiteAccessReportedHeaders(), cookie: `${name}=${token}`, origin}, cache: "no-store", signal})
        .then(async response => {
          if (response.status >= 500) throw new Error("Access verification unavailable");
          return response.ok ? response.json() : null;
        }),
    ]);
    signal.throwIfAborted();
  } catch {
    throw new SessionError("unavailable", "Sweatbox access verification is temporarily unavailable. Try again.", 503);
  } finally {controller.abort();}
  if (!session) throw new SessionError("unauthorized", "Your sign-in has expired. Sign in again to continue.", 401);
  const displayName = session.displayName || session.discordDisplayName || (typeof user?.username === "string" ? user.username : undefined);
  const actor: Actor = {accountId: session.accountId, staff, ...(displayName ? {displayName: displayName.slice(0, 128)} : {}), ...(session.discordId ? {discordId: session.discordId} : {})};
  if (canAccessStaffSimulator(user)) return canAssignMentees(user) ? {...actor, canAssign: true} : actor;
  const denied = new SessionError("forbidden", "Sweatbox access is limited to staff, administrators, Sweatbox Testers and assigned mentees.", 403);
  if (staff || !session.discordId) throw denied;
  if (admission.anySignedIn) return {...actor, simulatorAccess: false};
  let assigned = false;
  try {assigned = !!admission.hasAssignment && await admission.hasAssignment(session.discordId);}
  catch {throw new SessionError("unavailable", "Sweatbox access verification is temporarily unavailable. Try again.", 503);}
  if (!assigned) throw denied;
  return {...actor, simulatorAccess: false};
}
