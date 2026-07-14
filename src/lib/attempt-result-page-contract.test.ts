import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/exams/(learner)/attempts/[attemptId]/page.tsx", import.meta.url), "utf8");
const review = readFileSync(new URL("./attempt-review-details.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/exams/exams.css", import.meta.url), "utf8");

test("result page has centered summary, canonical actions, and collapsed review", () => {
  assert.match(page, /attempt-result-page/);
  assert.match(page, /attempt-result-card/);
  assert.match(page, /Return to quizzes/);
  assert.match(page, /View quiz/);
  assert.match(page, /<details/);
  assert.match(page, /Show attempt/);
  assert.match(page, /AttemptReviewDetails/);
  assert.match(review, /Detailed review is unavailable for this attempt/);
});

test("result page resolves server-side staff review access", () => {
  assert.match(page, /resolveLearnerAccess\(identity\.discordId\)/);
  assert.match(page, /access\.canAccessPrivateQuizzes/);
});

test("result styles include responsive and keyboard focus contracts", () => {
  assert.match(css, /\.attempt-result-page/);
  assert.match(css, /\.attempt-result-card/);
  assert.match(css, /\.attempt-review/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media \(max-width: 640px\)/);
});
