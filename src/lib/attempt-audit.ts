import type { DashboardAuditEvent } from "./dashboard-audit-client";

interface AttemptAuditIdentity {
  attemptId: string;
  quizId: string;
  learnerDiscordId: string;
  learnerAccountId?: string;
  actorDiscordId?: string;
  actorAccountId?: string;
  impersonating?: boolean;
}

function identityDetails(input: AttemptAuditIdentity): Record<string, string | null> {
  return input.impersonating ? {
    realActorAccountId: input.actorAccountId ?? null,
    impersonatedAccountId: input.learnerAccountId ?? null,
    impersonatedDiscordId: input.learnerDiscordId,
  } : {};
}

export function attemptStartedAuditEvent(input: AttemptAuditIdentity & { startedAt: Date }): DashboardAuditEvent {
  return {
    action: "exam.attempt.started",
    actorId: input.actorDiscordId ?? input.learnerDiscordId,
    targetType: "attempt",
    targetId: input.attemptId,
    summary: "Learner started a quiz attempt.",
    details: {
      quizId: input.quizId,
      learnerDiscordId: input.learnerDiscordId,
      ...identityDetails(input),
      startedAt: input.startedAt.toISOString(),
    },
  };
}

export function attemptCompletedAuditEvent(input: AttemptAuditIdentity & {
  submittedAt: Date;
  score: number;
  total: number;
  percentage: number;
  submissionReason: "manual" | "timeout";
}): DashboardAuditEvent {
  return {
    action: input.submissionReason === "timeout" ? "exam.attempt.timed_out" : "exam.attempt.submitted",
    actorId: input.actorDiscordId ?? input.learnerDiscordId,
    targetType: "attempt",
    targetId: input.attemptId,
    summary: input.submissionReason === "timeout" ? "Learner quiz attempt timed out." : "Learner submitted a quiz attempt.",
    details: {
      quizId: input.quizId,
      learnerDiscordId: input.learnerDiscordId,
      ...identityDetails(input),
      score: input.score,
      total: input.total,
      percentage: input.percentage,
      submissionReason: input.submissionReason,
      submittedAt: input.submittedAt.toISOString(),
    },
  };
}
