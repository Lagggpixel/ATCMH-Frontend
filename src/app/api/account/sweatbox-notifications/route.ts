import {z} from "zod/v3";
import {allowedMutationOrigins} from "@/src/lib/browser-session";
import {csrfMatches, introspectCentralSession, sessionTokenFromCookieHeader} from "@/src/lib/central-auth";
import {readNotificationPreferences, saveNotificationPreferences} from "@/src/simulator/server/notification-preferences";
import {sessionFailure} from "@/src/simulator/server/session-api";
import {SessionError} from "@/src/simulator/sessions";
async function handle(request: Request) {
  try {
    const token = sessionTokenFromCookieHeader(request.headers.get("cookie"));
    if (!token) throw new SessionError("unauthorized", "Sign in to continue.", 401);
    if (request.method !== "GET" && (!allowedMutationOrigins().has(request.headers.get("origin") ?? "") || !csrfMatches(token, request.headers.get("x-csrf-token")))) throw new SessionError("forbidden", "Refresh and try again.", 403);
    const session = await introspectCentralSession(token);
    if (!session) throw new SessionError("unauthorized", "Sign in to continue.", 401);
    const value = request.method === "GET" ? await readNotificationPreferences(session.accountId) : await saveNotificationPreferences(session.accountId, z.object({feedback: z.boolean(), assignment: z.boolean()}).strict().parse(await request.json()));
    return Response.json(value, {headers: {"cache-control": "no-store"}});
  } catch (error) {return sessionFailure(error);}
}
export const GET = handle;
export const POST = handle;
