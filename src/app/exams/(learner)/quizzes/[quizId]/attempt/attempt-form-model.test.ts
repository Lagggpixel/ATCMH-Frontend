import assert from "node:assert/strict";
import test from "node:test";

import { coordinateAttemptSubmission, remainingSeconds, toAttemptQuestions } from "./attempt-form-model";

test("toAttemptQuestions exposes only learner-safe question and option fields", () => {
  const questions = toAttemptQuestions([{
    id: "question-1",
    prompt: "Choose an answer",
    correctOptionId: "option-2",
    sortOrder: 4,
    randomizeOptions: true,
    options: [
      { id: "option-1", text: "First", sortOrder: 2 },
      { id: "option-2", text: "Second", sortOrder: 1 },
    ],
  }]);

  assert.deepEqual(questions, [{
    id: "question-1",
    prompt: "Choose an answer",
    options: [
      { id: "option-1", text: "First" },
      { id: "option-2", text: "Second" },
    ],
  }]);
  assert.equal("correctOptionId" in questions[0], false);
});

test("remainingSeconds counts down from a fixed start and never becomes negative", () => {
  const startedAt = 10_000;

  assert.equal(remainingSeconds(startedAt, 90, startedAt), 90);
  assert.equal(remainingSeconds(startedAt, 90, startedAt + 90_001), 0);
  assert.equal(remainingSeconds(startedAt, 90, startedAt + 100_000), 0);
});

test("coordinateAttemptSubmission recovers the one-shot guard after a rejected action", async () => {
  const guard = { current: false };

  const result = await coordinateAttemptSubmission(guard, async () => {
    throw new Error("network unavailable");
  });

  assert.deepEqual(result, {
    status: "error",
    message: "We couldn't submit your quiz. Please try again.",
  });
  assert.equal(guard.current, false);
});

test("coordinateAttemptSubmission restores the guard and preserves a returned recoverable error", async () => {
  const guard = { current: false };

  const result = await coordinateAttemptSubmission(guard, async () => ({
    error: "Your quiz could not be submitted. Please try again.",
  }));

  assert.deepEqual(result, {
    status: "error",
    message: "Your quiz could not be submitted. Please try again.",
  });
  assert.equal(guard.current, false);
});

test("coordinateAttemptSubmission allows only one concurrent manual or timeout submission", async () => {
  const guard = { current: false };
  let resolveAction!: (result: { attemptId: string }) => void;
  let actionCalls = 0;
  const action = () => {
    actionCalls += 1;
    return new Promise<{ attemptId: string }>((resolve) => {
      resolveAction = resolve;
    });
  };

  const manual = coordinateAttemptSubmission(guard, action);
  const timeout = coordinateAttemptSubmission(guard, action);

  assert.deepEqual(await timeout, { status: "ignored" });
  assert.equal(actionCalls, 1);

  resolveAction({ attemptId: "attempt-1" });
  assert.deepEqual(await manual, {
    status: "success",
    attemptId: "attempt-1",
  });
  assert.equal(guard.current, true);
});
