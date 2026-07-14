import type { QuizQuestion } from "@/src/lib/exams-repository";

export interface AttemptQuestion {
  id: string;
  prompt: string;
  options: Array<{ id: string; text: string }>;
}

export const SUBMISSION_RECOVERY_MESSAGE = "We couldn't submit your quiz. Please try again.";

type SubmissionGuard = { current: boolean };
type SubmissionActionResult = { attemptId: string } | { error: string };
type CoordinatedSubmissionResult =
  | { status: "ignored" }
  | { status: "success"; attemptId: string }
  | { status: "error"; message: string };

export async function coordinateAttemptSubmission(
  guard: SubmissionGuard,
  action: () => Promise<SubmissionActionResult>,
): Promise<CoordinatedSubmissionResult> {
  if (guard.current) return { status: "ignored" };
  guard.current = true;

  try {
    const result = await action();
    if ("attemptId" in result) {
      return { status: "success", attemptId: result.attemptId };
    }

    guard.current = false;
    return { status: "error", message: result.error || SUBMISSION_RECOVERY_MESSAGE };
  } catch {
    guard.current = false;
    return { status: "error", message: SUBMISSION_RECOVERY_MESSAGE };
  }
}

export function toAttemptQuestions(questions: readonly QuizQuestion[]): AttemptQuestion[] {
  return questions.map((question) => ({
    id: question.id,
    prompt: question.prompt,
    options: question.options.map((option) => ({ id: option.id, text: option.text })),
  }));
}

export function remainingSeconds(startedAt: number, limitSeconds: number, now: number): number {
  const elapsedSeconds = Math.floor(Math.max(0, now - startedAt) / 1_000);
  return Math.max(0, limitSeconds - elapsedSeconds);
}
