type Fetch = (input: URL, init: RequestInit) => Promise<Response>;
export interface AssignmentNotice {discordId: string; title: string; airport: string; trainer: string}

/** Asks the backend bot to DM the mentee. Best effort: a closed DM or outage never blocks the assignment. */
export async function notifyAssignment(notice: AssignmentNotice, env: Record<string, string | undefined> = process.env, fetchImpl: Fetch = fetch): Promise<boolean> {
  const api = env.DASHBOARD_API_URL?.trim(), key = env.EXAMS_AUTH_KEY?.trim(), origin = env.FRONTEND_PUBLIC_ORIGIN?.trim();
  if (!api || !key || !origin) return false;
  try {
    const response = await fetchImpl(new URL("/internal/auth/sweatbox/assignment-notifications", api), {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(5000),
      headers: {"content-type": "application/json", "X-Exams-Auth-Key": key},
      body: JSON.stringify({...notice, link: new URL("/sweatbox/mentee", origin).href}),
    });
    return response.ok;
  } catch {return false;}
}
