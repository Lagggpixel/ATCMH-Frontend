import type { QuizSummary } from "./exams-repository";

export interface QuizCatalogueFilters {
  query: string;
  category: string;
}

export function filterQuizSummaries(quizzes: readonly QuizSummary[], filters: QuizCatalogueFilters): QuizSummary[] {
  const query = filters.query.trim().toLocaleLowerCase();
  return quizzes.filter((quiz) => {
    const matchesCategory = filters.category === "all" || quiz.categoryId === filters.category;
    const searchable = `${quiz.title} ${quiz.description} ${quiz.category}`.toLocaleLowerCase();
    return matchesCategory && (query.length === 0 || searchable.includes(query));
  });
}

export function quizCategoryOptions(quizzes: readonly QuizSummary[]): Array<{ id: string; label: string }> {
  return [...new Map(quizzes.map((quiz) => [quiz.categoryId, quiz.category])).entries()]
    .map(([id, label]) => ({ id, label }))
    .toSorted((left, right) => left.label.localeCompare(right.label));
}
