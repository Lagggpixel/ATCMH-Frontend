/** Identity resolved only from a currently active shared ATCMH session. */
export interface LearnerIdentity {
  accountId?: string;
  discordId: string;
  displayName: string;
  impersonating?: boolean;
  realActorAccountId?: string;
  realActorDiscordId?: string;
}
