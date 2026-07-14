export type ManagementCapability =
  | "manage-exams"
  | "import-exams"
  | "unlock-learners"
  | "review-attempts"
  | "publish-exams"
  | "manage-taxonomy"
  | "manage-system";

export interface ManagementActor {
  accountId?: string;
  discordId?: string;
  /** @deprecated Use discordId. Kept for the existing caller contract. */
  id?: string;
  capabilities?: readonly ManagementCapability[];
  canManageAll: boolean;
  impersonating?: boolean;
  impersonatedAccountId?: string;
  impersonatedDiscordId?: string;
}

function actorDiscordId(actor: ManagementActor) {
  return actor.discordId ?? actor.id;
}

/**
 * Defensive service-layer gate. Route handlers must still derive the actor
 * from Discord instead of accepting Dashboard-provided role claims.
 */
export function assertManagementCapability(actor: ManagementActor, capability: ManagementCapability) {
  if (!actorDiscordId(actor) || !actor.capabilities?.includes(capability)) {
    throw new Error("not permitted");
  }
}

/** Global website and taxonomy changes are administrator-only. */
export function assertAdministrator(actor: ManagementActor) {
  if (!actorDiscordId(actor) || !actor.canManageAll) {
    throw new Error("administrator access is required");
  }
}

/**
 * The preserved LMS schema has no quiz-author relation. Discord-authorized
 * mentors therefore manage quizzes by role, not by a fabricated ownership ID.
 */
export function canManageQuiz(actor: ManagementActor, _ownerId: string) {
  return Boolean(actorDiscordId(actor));
}
