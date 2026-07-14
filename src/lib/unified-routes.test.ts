import assert from "node:assert/strict";
import test from "node:test";

import { EXAMS_BASE_PATH, examsPath, isCanonicalAppPath } from "./unified-routes";

test("Exams pages and handlers stay under the canonical /exams boundary", () => {
  assert.equal(EXAMS_BASE_PATH, "/exams");
  assert.equal(examsPath("/quizzes/quiz-1"), "/exams/quizzes/quiz-1");
  assert.equal(examsPath("/api/auth/session"), "/exams/api/auth/session");
});

test("the unified app exposes only canonical product roots", () => {
  for (const path of ["/", "/terms", "/policy", "/leaderboard", "/auth", "/account", "/consent", "/dashboard", "/dashboard/exams/attempts/1", "/exams", "/exams/quizzes/1", "/exams/api/health"]) {
    assert.equal(isCanonicalAppPath(path), true, path);
  }
  assert.equal(isCanonicalAppPath("/apply"), false);
  assert.equal(isCanonicalAppPath("/admin"), false);
});
