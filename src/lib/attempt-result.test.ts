import assert from "node:assert/strict";
import test from "node:test";

import { getAttemptReview } from "./attempt-result";

const snapshot = {
  version: 2,
  feedbackMode: "after_submission",
  questions: [
    { id: "q1", prompt: "Correct?", options: [{ id: "a", text: "Yes" }, { id: "b", text: "No" }], selectedOptionId: "a", correctOptionId: "a" },
    { id: "q2", prompt: "Incorrect?", options: [{ id: "a", text: "Yes" }, { id: "b", text: "No" }], selectedOptionId: "b", correctOptionId: "a" },
    { id: "q3", prompt: "Unanswered?", options: [{ id: "a", text: "Yes" }], selectedOptionId: null, correctOptionId: "a" },
  ],
};

test("versioned review reports correct, incorrect, and unanswered selections", () => {
  assert.deepEqual(getAttemptReview(snapshot), {
    available: true,
    revealCorrectness: true,
    questions: [
      { prompt: "Correct?", selectedText: "Yes", correctText: "Yes", state: "correct" },
      { prompt: "Incorrect?", selectedText: "No", correctText: "Yes", state: "incorrect" },
      { prompt: "Unanswered?", selectedText: null, correctText: "Yes", state: "unanswered" },
    ],
  });
});

test("none feedback mode redacts correct answers and correctness", () => {
  const review = getAttemptReview({ ...snapshot, feedbackMode: "none" });
  assert.equal(review.available, true);
  if (!review.available) return;
  assert.equal(review.revealCorrectness, false);
  assert.deepEqual(review.questions.map(({ selectedText, correctText, state }) => ({ selectedText, correctText, state })), [
    { selectedText: "Yes", correctText: null, state: "selected" },
    { selectedText: "No", correctText: null, state: "selected" },
    { selectedText: null, correctText: null, state: "unanswered" },
  ]);
});

test("legacy and malformed snapshots do not reconstruct mutable quiz data", () => {
  assert.deepEqual(getAttemptReview([]), { available: false });
  assert.deepEqual(getAttemptReview({ version: 2, feedbackMode: "after_submission", questions: [] }), { available: false });
});

test("normalizes persisted end feedback mode in completed version-two snapshots", () => {
  const review = getAttemptReview({ ...snapshot, feedbackMode: "end" });
  assert.equal(review.available, true);
  if (review.available) assert.equal(review.revealCorrectness, true);
});

test("stored legacy correctness can render when the correct option text was not preserved", () => {
  const review = getAttemptReview({
    version: 2,
    feedbackMode: "after_submission",
    questions: [{
      id: "q1",
      prompt: "Legacy question",
      options: [{ id: "selected", text: "Recorded selection" }],
      selectedOptionId: "selected",
      correctOptionId: null,
      selectedIsCorrect: false,
    }],
  });

  assert.deepEqual(review, {
    available: true,
    revealCorrectness: true,
    questions: [{ prompt: "Legacy question", selectedText: "Recorded selection", correctText: null, state: "incorrect" }],
  });
});

test("rejects snapshots with duplicate question or option IDs", () => {
  assert.deepEqual(getAttemptReview({ ...snapshot, questions: [snapshot.questions[0], snapshot.questions[0]] }), { available: false });
  assert.deepEqual(getAttemptReview({
    ...snapshot,
    questions: [{ ...snapshot.questions[0], options: [snapshot.questions[0].options[0], snapshot.questions[0].options[0]] }],
  }), { available: false });
});

test("rejects snapshots whose selected or correct option does not belong to the question", () => {
  assert.deepEqual(getAttemptReview({
    ...snapshot,
    questions: [{ ...snapshot.questions[0], selectedOptionId: "missing" }],
  }), { available: false });
  assert.deepEqual(getAttemptReview({
    ...snapshot,
    questions: [{ ...snapshot.questions[0], correctOptionId: "missing" }],
  }), { available: false });
});
