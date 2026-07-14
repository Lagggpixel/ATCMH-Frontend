import { NextResponse } from "next/server";

import { attemptIdForStart, attemptStartCookieName, createAttemptStart, readAttemptStart } from "@/src/lib/attempt-start-contract";
import { attemptStartedAuditEvent } from "@/src/lib/attempt-audit";
import { emitDashboardAuditEvent } from "@/src/lib/dashboard-audit-client";
import { getQuizForLearner } from "@/src/lib/exams-repository";
import { getVerifiedLearnerIdentity } from "@/src/lib/learner-session";
import { resolveLearnerAccess } from "@/src/lib/learner-access";
import { authorizeLearnerMutation } from "@/src/lib/browser-session";
import { examsCookieOptions } from "@/src/lib/exams-cookie";
import { getAppBaseUrl } from "@/src/lib/app-url";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params;
  if (!await authorizeLearnerMutation(request.headers.get("origin"), request.headers.get("cookie"), request.headers.get("X-CSRF-Token"))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const identity = await getVerifiedLearnerIdentity();
  if (!identity) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const access = await resolveLearnerAccess(identity.discordId);
  const quiz = await getQuizForLearner(quizId, access).catch(() => null);
  if (!quiz) return new Response("Quiz not found", { status: 404 });
  const secret = process.env.EXAMS_LEARNER_SESSION_SECRET;
  if (!secret || secret.length < 32) return new Response("Exam sessions are not configured", { status: 503 });

  const cookieName = attemptStartCookieName(quiz.id);
  const requestCookies = request.headers.get("cookie") ?? "";
  const existingToken = requestCookies.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  const existing = readAttemptStart(secret, existingToken, identity.discordId, quiz.id);
  const response = NextResponse.json({ redirectTo: `/exams/quizzes/${encodeURIComponent(quiz.id)}/attempt` });
  if (!existing) {
    const start = createAttemptStart(secret, { discordId: identity.discordId, quizId: quiz.id, timeLimitSeconds: quiz.timeLimitSeconds });
    response.cookies.set(cookieName, start.token, {
      ...examsCookieOptions(getAppBaseUrl().origin),
      maxAge: Math.max(8 * 60 * 60, quiz.timeLimitSeconds + 60 * 60),
    });
    try {
      await emitDashboardAuditEvent(attemptStartedAuditEvent({
        attemptId: attemptIdForStart(start),
        quizId: quiz.id,
        learnerDiscordId: identity.discordId,
        learnerAccountId: identity.accountId,
        actorDiscordId: identity.realActorDiscordId,
        actorAccountId: identity.realActorAccountId,
        impersonating: identity.impersonating,
        startedAt: new Date(start.startedAt * 1_000),
      }));
    } catch {
      // Dashboard audit delivery is best effort and must not block a learner from starting.
    }
  }
  return response;
}
