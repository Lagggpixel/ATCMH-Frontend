import { cookies } from "next/headers";

import { csrfTokenFor, examsSessionCookie, introspectCentralSession } from "@/src/lib/central-auth";
import { corsPreflight, withManagementCors } from "@/src/lib/management-cors";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const token = (await cookies()).get(examsSessionCookie)?.value;
  const central = await introspectCentralSession(token);
  const session = central && token ? {
    accountId: central.accountId,
    discordId: central.discordId,
    expiresAt: central.expiresAt,
    csrfToken: csrfTokenFor(token),
    impersonating: central.impersonating,
    ...(central.impersonating ? {
      realActorAccountId: central.realActorAccountId,
      realActorDiscordId: central.realActorDiscordId,
      impersonatedAccountId: central.accountId,
      impersonatedDiscordId: central.discordId,
    } : {}),
  } : null;
  return withManagementCors(request, Response.json({ session }, { headers: { "cache-control": "no-store" } }));
}

export function OPTIONS(request: Request) {
  return corsPreflight(request);
}
