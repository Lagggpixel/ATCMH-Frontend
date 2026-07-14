import type { AttemptReviewSnapshot } from "./attempt-service";

type ReviewState = "correct" | "incorrect" | "unanswered" | "selected";

export type AttemptReview = { available: false } | {
  available: true;
  revealCorrectness: boolean;
  questions: Array<{
    prompt: string;
    selectedText: string | null;
    correctText: string | null;
    state: ReviewState;
  }>;
};

function isReviewSnapshot(value: unknown): value is AttemptReviewSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<AttemptReviewSnapshot>;
  if (snapshot.version !== 2
    || !["after_submission", "after_each_question", "none"].includes(snapshot.feedbackMode ?? "")
    || !Array.isArray(snapshot.questions)
    || snapshot.questions.length === 0) return false;
  const questionIds = new Set<string>();
  return snapshot.questions.every((question) => {
    if (!question
      || typeof question.id !== "string"
      || questionIds.has(question.id)
      || typeof question.prompt !== "string"
      || (question.correctOptionId !== null && typeof question.correctOptionId !== "string")
      || (question.selectedIsCorrect !== undefined && typeof question.selectedIsCorrect !== "boolean")
      || (question.selectedOptionId !== null && typeof question.selectedOptionId !== "string")
      || !Array.isArray(question.options)) return false;
    questionIds.add(question.id);
    const optionIds = new Set<string>();
    if (!question.options.every((option) => {
      if (!option || typeof option.id !== "string" || optionIds.has(option.id) || typeof option.text !== "string") return false;
      optionIds.add(option.id);
      return true;
    })) return false;
    return (question.correctOptionId === null || optionIds.has(question.correctOptionId))
      && (question.selectedOptionId === null || optionIds.has(question.selectedOptionId));
  });
}

function normalizeStoredFeedbackMode(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const snapshot = value as { version?: unknown; feedbackMode?: unknown };
  if (snapshot.version !== 2) return value;
  if (snapshot.feedbackMode === "end") return { ...snapshot, feedbackMode: "after_submission" };
  if (snapshot.feedbackMode === "immediate") return { ...snapshot, feedbackMode: "after_each_question" };
  return value;
}

export function getAttemptReview(snapshot: unknown): AttemptReview {
  const normalizedSnapshot = normalizeStoredFeedbackMode(snapshot);
  if (!isReviewSnapshot(normalizedSnapshot)) return { available: false };
  const reviewSnapshot = normalizedSnapshot;
  const revealCorrectness = reviewSnapshot.feedbackMode !== "none";
  return {
    available: true,
    revealCorrectness,
    questions: reviewSnapshot.questions.map((question) => {
      const selectedText = question.options.find((option) => option.id === question.selectedOptionId)?.text ?? null;
      const correctText = revealCorrectness && question.correctOptionId !== null
        ? question.options.find((option) => option.id === question.correctOptionId)?.text ?? null
        : null;
      const state: ReviewState = question.selectedOptionId === null
        ? "unanswered"
        : !revealCorrectness
          ? "selected"
          : (question.selectedIsCorrect ?? (question.selectedOptionId === question.correctOptionId)) ? "correct" : "incorrect";
      return { prompt: question.prompt, selectedText, correctText, state };
    }),
  };
}
