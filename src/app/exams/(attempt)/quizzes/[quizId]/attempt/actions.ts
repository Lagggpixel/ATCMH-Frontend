"use server";

import type { FeedbackMode, SnapshotQuestion, StoredAttempt, WritableAttemptConnection } from "@/src/lib/attempt-service";
import type { AttemptWebhookInput } from "@/src/lib/attempt-webhook-payload";
import type { Quiz } from "@/src/lib/exams-repository";
import type { LearnerIdentity } from "@/src/lib/learner-identity";
import type { AttemptStart } from "@/src/lib/attempt-start-contract";
import type { LearnerAccessContext } from "@/src/lib/learner-access";
import type { DashboardAuditEvent } from "@/src/lib/dashboard-audit-client";
import { attemptIdForStart, orderAttemptQuestions } from "@/src/lib/attempt-start-contract";
import { normalizeFeedbackMode } from "@/src/lib/attempt-service";
import { attemptCompletedAuditEvent } from "@/src/lib/attempt-audit";

const SUBMISSION_ERROR = "Unable to submit attempt.";

export interface LearnerSubmissionInput {
  quizId: string;
  answers: Record<string, string | undefined>;
  submissionReason: "manual" | "timeout";
}

interface AttemptResult {
  score: number;
  total: number;
  percentage: number;
}

export interface LearnerSubmissionDependencies {
  getVerifiedLearnerIdentity(): Promise<LearnerIdentity | undefined>;
  resolveLearnerAccess(discordId: string): Promise<LearnerAccessContext>;
  getQuizForLearner(quizId: string, context: LearnerAccessContext): Promise<Quiz | null>;
  getVerifiedAttemptStart(discordId: string, quizId: string): Promise<AttemptStart | undefined>;
  getAttemptByReference(id: string): Promise<StoredAttempt | null>;
  validateSubmittedAnswers(
    questions: readonly SnapshotQuestion[],
    answers: Readonly<Record<string, string | undefined>>,
  ): Record<string, string | undefined>;
  withWriteTransaction<T>(fn: (connection: WritableAttemptConnection) => Promise<T>): Promise<T>;
  submitAttempt(connection: WritableAttemptConnection, input: {
    attemptId: string;
    attemptCode: string;
    quizId: string;
    studentDiscordId: string;
    submittedAt: Date;
    answers: Record<string, string | undefined>;
    questions: readonly SnapshotQuestion[];
    submissionReason: "manual" | "timeout";
    feedbackMode: FeedbackMode;
  }): Promise<AttemptResult>;
  sendAttemptWebhook(input: AttemptWebhookInput): Promise<void>;
  sendAttemptAuditEvent?(event: DashboardAuditEvent): Promise<unknown>;
  now(): Date;
  appUrl(path: string): URL;
  logSubmissionFailure(stage: string, classification: { errorClass: string; errorCode?: string }): void;
}

function classifySubmissionFailure(error: unknown): { errorClass: string; errorCode?: string } {
  if (!(error instanceof Error)) return { errorClass: "UnknownError" };
  const errorClass = /^[A-Za-z]*Error$/.test(error.name) ? error.name : "Error";
  const code = "code" in error && typeof error.code === "string" && /^[A-Z0-9_]{1,64}$/.test(error.code)
    ? error.code
    : undefined;
  return code ? { errorClass, errorCode: code } : { errorClass };
}

function isDuplicateEntryError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ER_DUP_ENTRY";
}

export async function executeLearnerSubmission(
  dependencies: LearnerSubmissionDependencies,
  input: LearnerSubmissionInput,
): Promise<{ attemptId: string } | { error: string }> {
  if (input.submissionReason !== "manual" && input.submissionReason !== "timeout") {
    return { error: SUBMISSION_ERROR };
  }

  let committedAttempt: {
    attemptId: string;
    attemptCode: string;
    identity: LearnerIdentity;
    quiz: Quiz;
    result: AttemptResult;
    submissionReason: "manual" | "timeout";
    submittedAt: Date;
  };
  let failureStage = "authenticate";

  try {
    const identity = await dependencies.getVerifiedLearnerIdentity();
    if (!identity) return { error: SUBMISSION_ERROR };

    failureStage = "authorize_quiz";
    const access = await dependencies.resolveLearnerAccess(identity.discordId);
    const quiz = await dependencies.getQuizForLearner(input.quizId, access);
    if (!quiz) return { error: SUBMISSION_ERROR };
    const feedbackMode = normalizeFeedbackMode(quiz.feedbackMode);
    if (!feedbackMode) return { error: SUBMISSION_ERROR };
    const attemptStart = await dependencies.getVerifiedAttemptStart(identity.discordId, quiz.id);
    if (!attemptStart) return { error: SUBMISSION_ERROR };

    const submittedAt = dependencies.now();
    const expired = attemptStart.deadline !== null
      && Math.floor(submittedAt.getTime() / 1_000) >= attemptStart.deadline;
    if ((input.submissionReason === "manual" && expired)
      || (input.submissionReason === "timeout" && !expired)) {
      return { error: SUBMISSION_ERROR };
    }
    const submissionReason: "manual" | "timeout" = expired ? "timeout" : "manual";

    failureStage = "validate_answers";
    const attemptQuestions = orderAttemptQuestions(quiz.questions, quiz.randomizeQuestions, attemptStart.nonce);
    const answers = dependencies.validateSubmittedAnswers(attemptQuestions, input.answers);
    const attemptId = attemptIdForStart(attemptStart);
    const attemptCode = attemptId.replace(/-/g, "");
    failureStage = "persist_attempt";
    let result: AttemptResult;
    try {
      result = await dependencies.withWriteTransaction((connection) => dependencies.submitAttempt(connection, {
        attemptId,
        attemptCode,
        quizId: quiz.id,
        studentDiscordId: identity.discordId,
        submittedAt,
        answers,
        questions: attemptQuestions,
        submissionReason,
        feedbackMode,
      }));
    } catch (error) {
      if (!isDuplicateEntryError(error)) throw error;
      const existingAttempt = await dependencies.getAttemptByReference(attemptId);
      if (existingAttempt?.studentDiscordId === identity.discordId && existingAttempt.quizId === quiz.id) {
        return { attemptId };
      }
      throw error;
    }

    committedAttempt = { attemptId, attemptCode, identity, quiz, result, submissionReason, submittedAt };
  } catch (error) {
    try {
      dependencies.logSubmissionFailure(failureStage, classifySubmissionFailure(error));
    } catch {
      // Logging is best effort and must not replace the stable learner-facing response.
    }
    return { error: SUBMISSION_ERROR };
  }

  try {
    await dependencies.sendAttemptWebhook({
      quizTitle: committedAttempt.quiz.title,
      discordId: committedAttempt.identity.discordId,
      score: committedAttempt.result.score,
      total: committedAttempt.result.total,
      percentage: committedAttempt.result.percentage,
      submissionReason: committedAttempt.submissionReason,
      attemptCode: committedAttempt.attemptCode,
      attemptId: committedAttempt.attemptId,
      submittedAt: committedAttempt.submittedAt,
      attemptUrl: dependencies.appUrl(`/exams/attempts/${encodeURIComponent(committedAttempt.attemptCode)}`),
    });
  } catch {
    // Notification delivery is best effort and must not invalidate a committed attempt.
  }

  try {
    await dependencies.sendAttemptAuditEvent?.(attemptCompletedAuditEvent({
      attemptId: committedAttempt.attemptId,
      quizId: committedAttempt.quiz.id,
      learnerDiscordId: committedAttempt.identity.discordId,
      learnerAccountId: committedAttempt.identity.accountId,
      actorDiscordId: committedAttempt.identity.realActorDiscordId,
      actorAccountId: committedAttempt.identity.realActorAccountId,
      impersonating: committedAttempt.identity.impersonating,
      score: committedAttempt.result.score,
      total: committedAttempt.result.total,
      percentage: committedAttempt.result.percentage,
      submissionReason: committedAttempt.submissionReason,
      submittedAt: committedAttempt.submittedAt,
    }));
  } catch {
    // Dashboard audit delivery is best effort and must not invalidate a committed attempt.
  }

  return { attemptId: committedAttempt.attemptId };
}

export async function submitLearnerAttempt(
  input: LearnerSubmissionInput & { csrfToken: string },
): Promise<{ attemptId: string } | { error: string }> {
  const [nextHeaders, browserSession] = await Promise.all([
    import("next/headers"), import("@/src/lib/browser-session"),
  ]);
  const requestHeaders = await nextHeaders.headers();
  const cookieHeader = (await nextHeaders.cookies()).toString();
  if (!await browserSession.authorizeLearnerMutation(requestHeaders.get("origin"), cookieHeader, input.csrfToken)) {
    return { error: SUBMISSION_ERROR };
  }
  const [session, attemptStartSession, access, repository, attemptService, database, webhook, audit, urls] = await Promise.all([
    import("@/src/lib/learner-session"),
    import("@/src/lib/attempt-start-session"),
    import("@/src/lib/learner-access"),
    import("@/src/lib/exams-repository"),
    import("@/src/lib/attempt-service"),
    import("@/src/lib/db"),
    import("@/src/lib/attempt-webhook"),
    import("@/src/lib/dashboard-audit-client"),
    import("@/src/lib/app-url"),
  ]);

  const result = await executeLearnerSubmission({
    getVerifiedLearnerIdentity: session.getVerifiedLearnerIdentity,
    resolveLearnerAccess: access.resolveLearnerAccess,
    getVerifiedAttemptStart: attemptStartSession.getVerifiedAttemptStart,
    getQuizForLearner: repository.getQuizForLearner,
    getAttemptByReference: repository.getAttemptByReference,
    validateSubmittedAnswers: attemptService.validateSubmittedAnswers,
    withWriteTransaction: database.withWriteTransaction,
    submitAttempt: attemptService.submitAttempt,
    sendAttemptWebhook: webhook.sendAttemptWebhook,
    sendAttemptAuditEvent: audit.emitDashboardAuditEvent,
    now: () => new Date(),
    appUrl: urls.appUrl,
    logSubmissionFailure: (stage, classification) => {
      console.error("Quiz submission failed", { stage, ...classification });
    },
  }, { quizId: input.quizId, answers: input.answers, submissionReason: input.submissionReason });
  if ("attemptId" in result) await attemptStartSession.clearAttemptStart(input.quizId);
  return result;
}
