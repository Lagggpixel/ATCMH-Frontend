import assert from "node:assert/strict";
import test from "node:test";

import {courseQuizRequirementSatisfied} from "./course-repository";

const quizId = "123e4567-e89b-42d3-a456-426614174000";

test("required course quizzes need an attempt and use the learner's best percentage", () => {
  const required = {type: "quiz" as const, quizId, required: true};
  const passing = {type: "quiz" as const, quizId, required: true, passPercentage: 80};

  assert.equal(courseQuizRequirementSatisfied({type: "quiz", quizId, required: false}, []), true);
  assert.equal(courseQuizRequirementSatisfied(required, []), false);
  assert.equal(courseQuizRequirementSatisfied(required, [{quizId, attemptCount: 0, bestPercentage: 100, lastAttemptAt: null}]), false);
  assert.equal(courseQuizRequirementSatisfied(required, [{quizId, attemptCount: 1, bestPercentage: 0, lastAttemptAt: null}]), true);
  assert.equal(courseQuizRequirementSatisfied(passing, [{quizId, attemptCount: 2, bestPercentage: 79, lastAttemptAt: null}]), false);
  assert.equal(courseQuizRequirementSatisfied(passing, [{quizId, attemptCount: 2, bestPercentage: 80, lastAttemptAt: null}]), true);
});
