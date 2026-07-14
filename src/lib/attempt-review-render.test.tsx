import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { AttemptReviewDetails } from "./attempt-review-details";
import { getAttemptReview } from "./attempt-result";

const snapshot = {
  version: 2,
  feedbackMode: "after_submission",
  questions: [{
    id: "q1",
    prompt: "What is controlled airspace?",
    options: [{ id: "secret-correct-id", text: "Secret correct answer" }, { id: "wrong", text: "Wrong answer" }],
    selectedOptionId: "wrong",
    correctOptionId: "secret-correct-id",
  }],
};

test("none feedback mode serializes no correct text, correct ID, or per-question correctness", () => {
  const html = renderToStaticMarkup(<AttemptReviewDetails review={getAttemptReview({ ...snapshot, feedbackMode: "none" })} />);
  assert.doesNotMatch(html, /Secret correct answer|secret-correct-id|Correct answer|Incorrect|Correct/);
  assert.match(html, /Wrong answer/);
  assert.match(html, /Selected answer/);
});

test("reveal feedback modes still serialize correct answer feedback", () => {
  for (const feedbackMode of ["after_submission", "after_each_question"]) {
    const html = renderToStaticMarkup(<AttemptReviewDetails review={getAttemptReview({ ...snapshot, feedbackMode })} />);
    assert.match(html, /Correct answer/);
    assert.match(html, /Secret correct answer/);
    assert.match(html, /Incorrect/);
  }
});
