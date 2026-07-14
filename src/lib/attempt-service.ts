import type { PoolConnection } from "mysql2/promise";

export interface EligibleQuiz {
  id: string;
  isPrivate: boolean;
}

export interface QuizUnlock {
  quizId: string;
  userId: string;
}

export interface SnapshotQuestion {
  id: string;
  prompt: string;
  correctOptionId: string;
  options: Array<{ id: string; text: string }>;
}

export type FeedbackMode = "after_submission" | "after_each_question" | "none";

/** Maps the persisted LMS values into the versioned review snapshot contract. */
export function normalizeFeedbackMode(value: string): FeedbackMode | undefined {
  if (value === "none") return "none";
  if (value === "immediate" || value === "after_each_question") return "after_each_question";
  if (value === "end" || value === "after_submission") return "after_submission";
  return undefined;
}

export interface AttemptReviewSnapshot {
  version: 2;
  feedbackMode: FeedbackMode;
  questions: Array<{
    id: string;
    prompt: string;
    options: Array<{ id: string; text: string }>;
    selectedOptionId: string | null;
    correctOptionId: string | null;
    /** Stored by the legacy attempt_answers row when available. */
    selectedIsCorrect?: boolean;
  }>;
}

export interface StoredAttempt {
  id: string;
  /** Derived from the strict Discord mention stored in legacy student_name. */
  studentDiscordId: string | null;
  quizId: string;
  score: number;
  total: number;
  percentage: number;
  questionSnapshot: unknown;
  submissionReason: "manual" | "timeout";
}

export interface LearnerAttemptRepository {
  findAttempt(attemptId: string): Promise<StoredAttempt | null>;
}

export type WritableAttemptConnection = Pick<PoolConnection, "execute">;

export function filterEligible<T extends EligibleQuiz>(quizzes: readonly T[], userId: string, unlocks: readonly QuizUnlock[]): T[] {
  const unlockedQuizIds = new Set(unlocks.filter((unlock) => unlock.userId === userId).map((unlock) => unlock.quizId));
  return quizzes.filter((quiz) => !quiz.isPrivate || unlockedQuizIds.has(quiz.id));
}

export function assertQuizAttemptAccess(quiz: EligibleQuiz, verifiedDiscordId: string | undefined, unlocks: readonly QuizUnlock[]): void {
  if (!quiz.isPrivate) return;
  const isUnlocked = verifiedDiscordId !== undefined && unlocks.some(
    (unlock) => unlock.quizId === quiz.id && unlock.userId === verifiedDiscordId,
  );
  if (!isUnlocked) throw new Error("Quiz is not available to this learner");
}

export async function getAttemptForLearner(
  repository: LearnerAttemptRepository,
  attemptId: string,
  userId: string,
  canReviewAttempts = false,
): Promise<StoredAttempt> {
  const attempt = await repository.findAttempt(attemptId);
  if (!attempt || (!canReviewAttempts && (!attempt.studentDiscordId || attempt.studentDiscordId !== userId))) {
    throw new Error("Attempt is not available to this learner");
  }
  return attempt;
}

/** Route-level guard: callers must supply a server-verified Discord subject. */
export async function getAttemptResultForRoute(
  repository: LearnerAttemptRepository,
  attemptId: string,
  verifiedDiscordId: string | undefined,
  canReviewAttempts = false,
): Promise<StoredAttempt> {
  if (!verifiedDiscordId) throw new Error("Attempt is not available to this learner");
  return getAttemptForLearner(repository, attemptId, verifiedDiscordId, canReviewAttempts);
}

export function scoreAttempt(input: {
  quizId: string;
  answers: Record<string, string | undefined>;
  questions: readonly SnapshotQuestion[];
  submissionReason: "manual" | "timeout";
  feedbackMode: FeedbackMode;
}) {
  const answerRows = input.questions.map((question) => {
    const selectedOptionId = input.answers[question.id] ?? null;
    return { questionId: question.id, selectedOptionId, isCorrect: selectedOptionId === question.correctOptionId };
  });
  const score = answerRows.filter((answer) => answer.isCorrect).length;
  const total = answerRows.length;
  return {
    score,
    total,
    percentage: total === 0 ? 0 : Math.floor((score / total) * 100),
    submissionReason: input.submissionReason,
    questionSnapshot: {
      version: 2 as const,
      feedbackMode: input.feedbackMode,
      questions: input.questions.map((question) => ({
        id: question.id,
        prompt: question.prompt,
        options: question.options.map(({ id, text }) => ({ id, text })),
        selectedOptionId: input.answers[question.id] ?? null,
        correctOptionId: question.correctOptionId,
      })),
    },
    answerRows,
  };
}

export function validateSubmittedAnswers(
  questions: readonly SnapshotQuestion[],
  answers: Readonly<Record<string, string | undefined>>,
): Record<string, string | undefined> {
  const knownQuestions = new Map(
    questions.map((question) => [question.id, new Set(question.options.map((option) => option.id))]),
  );
  for (const [questionId, optionId] of Object.entries(answers)) {
    const options = knownQuestions.get(questionId);
    if (!options || (optionId !== undefined && !options.has(optionId))) {
      throw new Error("Invalid submitted answers");
    }
  }
  return Object.fromEntries(questions.map((question) => [question.id, answers[question.id]]));
}

/**
 * The caller must provide a connection already inside a database transaction.
 * This keeps the attempt header and its answer rows atomic.
 */
export async function submitAttempt(connection: WritableAttemptConnection, input: {
  attemptId: string;
  attemptCode: string;
  quizId: string;
  /** Obtained from the verified Discord session, never from the browser form. */
  studentDiscordId: string;
  /** Trusted server submission time. */
  submittedAt: Date;
  answers: Record<string, string | undefined>;
  questions: readonly SnapshotQuestion[];
  submissionReason: "manual" | "timeout";
  feedbackMode: FeedbackMode;
}) {
  const result = scoreAttempt(input);
  const submittedAt = input.submittedAt.toISOString();
  await connection.execute(
    `INSERT INTO attempts
       (id, code, quiz_id, student_name, score, total, percentage, submitted_at, timed_out, submission_reason, question_snapshot)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.attemptId,
      input.attemptCode,
      input.quizId,
      `<@${input.studentDiscordId}>`,
      result.score,
      result.total,
      result.percentage,
      submittedAt,
      result.submissionReason === "timeout",
      result.submissionReason,
      JSON.stringify(result.questionSnapshot),
    ],
  );
  for (const answer of result.answerRows) {
    if (answer.selectedOptionId === null) continue;
    await connection.execute(
      `INSERT INTO attempt_answers (attempt_id, question_id, selected_option_id, correct)
       VALUES (?, ?, ?, ?)`,
      [input.attemptId, answer.questionId, answer.selectedOptionId, answer.isCorrect],
    );
  }
  return result;
}
