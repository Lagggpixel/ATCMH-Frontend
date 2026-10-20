import {allowedMutationOrigins} from "../../lib/browser-session";
import {csrfMatches, introspectCentralSession, sessionTokenFromCookieHeader, sessionCookie, loopbackSessionCookie} from "../../lib/central-auth";
import {websiteAccessReportedHeaders} from "../../lib/website-access";
import {canAccessStaffSimulator, simulatorEnabled} from "../feature";
import {SessionError} from "../sessions";
import type {Actor} from "./session-service";

export async function authorizeSessionRequest(request: Request, staff: boolean): Promise<Actor> {
  if (!simulatorEnabled({SIMULATOR_ENABLED: process.env.SIMULATOR_ENABLED})) throw new SessionError("not-found", "Sweatbox unavailable.", 404);
  const token = sessionTokenFromCookieHeader(request.headers.get("cookie"));
  if (!token) throw new SessionError("unauthorized", "Sign in to join this session.", 401);
  if (request.method !== "GET" && (!allowedMutationOrigins().has(request.headers.get("origin") ?? "") || !csrfMatches(token, request.headers.get("x-csrf-token"))))
    throw new SessionError("forbidden", "Your sign-in could not be verified. Refresh and try again.", 403);
  const session = await introspectCentralSession(token);
  if (!session) throw new SessionError("unauthorized", "Your sign-in has expired. Sign in again to continue.", 401);
  // Both training seats require an allowed role; a code/link is not an access grant.
  const api = process.env.DASHBOARD_API_URL, origin = process.env.FRONTEND_PUBLIC_ORIGIN;
  if (!api || !origin) throw new SessionError("unavailable", "Sweatbox access verification is unavailable.", 503);
  const name = request.headers.get("cookie")?.includes(`${sessionCookie}=`) ? sessionCookie : loopbackSessionCookie;
  const response = await fetch(new URL("/admin/me", api), {headers: {...websiteAccessReportedHeaders(), cookie: `${name}=${token}`, origin}, cache: "no-store", signal: AbortSignal.timeout(5000)});
  const user = response.ok ? await response.json() : null;
  if (!canAccessStaffSimulator(user)) throw new SessionError("forbidden", "Sweatbox access is limited to staff, administrators and Sweatbox Testers.", 403);
  const displayName = session.displayName || session.discordDisplayName || (typeof user?.username === "string" ? user.username : undefined);
  return {accountId: session.accountId, staff, ...(displayName ? {displayName: displayName.slice(0, 128)} : {})};
}
