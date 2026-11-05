import {z} from "zod/v3";
import {hasReplayAtAirport} from "./replay-store";
import {internalResult, runtimeConfig, send} from "./runtime-client";
import {authorizeSessionRequest, type MenteeAdmission} from "./session-auth";

/** Debrief map data remains available at the airport a mentee trained at. */
export async function hasReplayReference(accountId: string, airport: string): Promise<boolean> {
  if (!/^[A-Z0-9]{4}$/.test(airport)) return false;
  const config = runtimeConfig();
  if (!config) return hasReplayAtAirport(accountId, airport);
  const query = new URLSearchParams({accountId, airport});
  return internalResult(await send(config, `/internal/replay-airport?${query}`, {}), z.boolean());
}

export function authorizeAirportReference(request: Request, staff: boolean, admission: MenteeAdmission = {}) {
  const airport = new URL(request.url).searchParams.get("airport") ?? "";
  return authorizeSessionRequest(request, staff, {...admission, hasReplay: accountId => hasReplayReference(accountId, airport)});
}
