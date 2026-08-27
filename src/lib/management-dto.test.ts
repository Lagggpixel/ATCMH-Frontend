import assert from "node:assert/strict";
import test from "node:test";

import { managedQuizDto, managedQuizSummaryDto } from "./management-dto";
import type { Quiz, QuizSummary } from "./exams-repository";

const summary: QuizSummary = {
  id: "c2a07cd2-3e2e-482e-b2ee-9d5c6fec6bc4",
  title: "Tower fundamentals",
  description: "",
  categoryId: "a447a1c6-0d75-4d09-93d9-1d902c7ed1df",
  category: "Tower",
  feedbackMode: "after_submission",
  timeLimitSeconds: 0,
  randomizeQuestions: false,
  isPrivate: true,
};

test("management quiz DTOs retain the canonical folder id", () => {
  const quiz: Quiz = {...summary, tags: [], questions: [], bankDraws: []};

  assert.equal(managedQuizSummaryDto(summary).categoryId, summary.categoryId);
  assert.equal(managedQuizDto(quiz).categoryId, summary.categoryId);
});
