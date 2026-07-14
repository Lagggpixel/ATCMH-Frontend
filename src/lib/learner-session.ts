import { cookies } from "next/headers";

import { examsSessionCookie, introspectCentralSession } from "./central-auth";
import type { LearnerIdentity } from "./learner-identity";

/** Introspects the opaque central session on every authorization-sensitive read. */
export async function getVerifiedLearnerIdentity(): Promise<LearnerIdentity | undefined> {
  const session = await getVerifiedCentralSession();
  return session ? {
    accountId: session.accountId,
    discordId: session.discordId,
    displayName: session.discordDisplayName ?? session.discordId,
    impersonating: session.impersonating,
    ...(session.impersonating ? { realActorAccountId: session.realActorAccountId, realActorDiscordId: session.realActorDiscordId } : {}),
  } : undefined;
}

export async function getVerifiedCentralSession() {
  return introspectCentralSession((await cookies()).get(examsSessionCookie)?.value);
}

/** Reads only an HttpOnly, signed Discord subject; never trust query/header IDs. */
export async function getVerifiedLearnerDiscordSubject(): Promise<string | undefined> {
  return (await getVerifiedLearnerIdentity())?.discordId;
}
