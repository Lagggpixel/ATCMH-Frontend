/** Identity resolved only from a currently active central Exams session. */
export interface LearnerIdentity {
  accountId?: string;
  discordId: string;
  displayName: string;
  impersonating?: boolean;
  realActorAccountId?: string;
  realActorDiscordId?: string;
}
