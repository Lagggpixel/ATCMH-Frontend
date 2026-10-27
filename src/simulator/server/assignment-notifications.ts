import {readNotificationPreferences} from "./notification-preferences";
type Fetch = (input: URL, init: RequestInit) => Promise<Response>;
export interface AssignmentNotice {discordId: string; title: string; airport: string; trainer: string}
export interface FeedbackNotice {accountId?: string; discordId?: string; title: string; airport: string; trainer: string; replayId?: string}
/** Resolve the active Discord identity on the central account before checking its preference. */
async function notify(kind: "assignment" | "feedback", notice: AssignmentNotice | FeedbackNotice, env: Record<string, string | undefined>, fetchImpl: Fetch): Promise<boolean> {
  const api = env.DASHBOARD_API_URL?.trim(), key = env.EXAMS_AUTH_KEY?.trim(), origin = env.FRONTEND_PUBLIC_ORIGIN?.trim();
  if (!api || !key || !origin) return false;
  try {
    const headers = {"content-type": "application/json", "X-Exams-Auth-Key": key};
    const recipient = await fetchImpl(new URL("/internal/auth/sweatbox/resolve-recipient", api), {method: "POST", headers, body: JSON.stringify("accountId" in notice && notice.accountId ? {accountId: notice.accountId} : {discordId: notice.discordId}), signal: AbortSignal.timeout(5000), cache: "no-store"});
    if (!recipient.ok) return false;
    const resolved = await recipient.json() as {accountId?: string; discordId?: string};
    if (!resolved.accountId || !resolved.discordId || ("accountId" in notice && notice.accountId && notice.accountId !== resolved.accountId) || !(await readNotificationPreferences(resolved.accountId))[kind]) return false;
    const replayId = "replayId" in notice ? notice.replayId : undefined;
    const link = new URL(replayId ? `/sweatbox/replays/${replayId}` : "/sweatbox/mentee", origin).href;
    const response = await fetchImpl(new URL(`/internal/auth/sweatbox/${kind}-notifications`, api), {method: "POST", cache: "no-store", signal: AbortSignal.timeout(5000), headers, body: JSON.stringify({accountId: resolved.accountId, discordId: resolved.discordId, title: notice.title, airport: notice.airport, trainer: notice.trainer, link})});
    return response.ok;
  } catch {return false;}
}
export const notifyAssignment = (notice: AssignmentNotice, env: Record<string, string | undefined> = process.env, fetchImpl: Fetch = fetch) => notify("assignment", notice, env, fetchImpl);
export const notifyFeedback = (notice: FeedbackNotice, env: Record<string, string | undefined> = process.env, fetchImpl: Fetch = fetch) => notify("feedback", notice, env, fetchImpl);
