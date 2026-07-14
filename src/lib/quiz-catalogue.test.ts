import assert from "node:assert/strict";
import test from "node:test";
import type { QuizSummary } from "./exams-repository";
import { filterQuizSummaries, quizCategoryOptions } from "./quiz-catalogue";

const quiz = (overrides: Partial<QuizSummary>): QuizSummary => ({
  id: crypto.randomUUID(),
  title: "ATC Fundamentals",
  description: "Core ATC concepts and phraseology.",
  categoryId: "fundamentals",
  category: "Fundamentals",
  feedbackMode: "after_submission",
  timeLimitSeconds: 1_800,
  randomizeQuestions: false,
  isPrivate: false,
  ...overrides,
});

const quizzes = [
  quiz({ title: "ATC Fundamentals" }),
  quiz({ title: "Ground Control", description: "Taxi and apron management.", categoryId: "ground", category: "Ground" }),
  quiz({ title: "Tower Operations", description: "Runway sequencing.", categoryId: "tower", category: "Tower" }),
];

test("catalogue search matches titles and descriptions without case sensitivity", () => {
  assert.deepEqual(filterQuizSummaries(quizzes, { query: "  APRON ", category: "all" }).map(({ title }) => title), ["Ground Control"]);
});

test("catalogue category filtering composes with search", () => {
  assert.deepEqual(filterQuizSummaries(quizzes, { query: "operations", category: "tower" }).map(({ title }) => title), ["Tower Operations"]);
  assert.deepEqual(filterQuizSummaries(quizzes, { query: "ground", category: "fundamentals" }), []);
});

test("catalogue category options are unique, sorted, and retain stable IDs", () => {
  assert.deepEqual(quizCategoryOptions(quizzes), [
    { id: "fundamentals", label: "Fundamentals" },
    { id: "ground", label: "Ground" },
    { id: "tower", label: "Tower" },
  ]);
});
