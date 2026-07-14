import type { Quiz, QuizSummary } from "./exams-repository";

/** Dashboard contract: never disclose database option IDs or answer-key IDs. */
export function managedQuizDto(quiz: Quiz) {
  return {
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    category: quiz.category,
    feedbackMode: quiz.feedbackMode,
    timeLimitSeconds: quiz.timeLimitSeconds,
    tags: quiz.tags.map((tag) => tag.name),
    isPrivate: quiz.isPrivate,
    randomizeQuestions: quiz.randomizeQuestions,
    questions: quiz.questions.map((question) => ({
      prompt: question.prompt,
      randomizeOptions: question.randomizeOptions,
      options: question.options.map((option) => ({
        text: option.text,
        isCorrect: option.id === question.correctOptionId,
      })),
    })),
  };
}

export function managedQuizSummaryDto(quiz: QuizSummary) {
  return {
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    category: quiz.category,
    feedbackMode: quiz.feedbackMode,
    timeLimitSeconds: quiz.timeLimitSeconds,
    randomizeQuestions: quiz.randomizeQuestions,
    isPrivate: quiz.isPrivate,
  };
}
