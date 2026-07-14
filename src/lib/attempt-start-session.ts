import "server-only";

import { cookies } from "next/headers";

import { attemptStartCookieName, readAttemptStart } from "./attempt-start-contract";

export async function getVerifiedAttemptStart(discordId: string, quizId: string) {
  const secret = process.env.EXAMS_LEARNER_SESSION_SECRET;
  if (!secret) return undefined;
  return readAttemptStart(secret, (await cookies()).get(attemptStartCookieName(quizId))?.value, discordId, quizId);
}

export async function clearAttemptStart(quizId: string) {
  (await cookies()).delete(attemptStartCookieName(quizId));
}
