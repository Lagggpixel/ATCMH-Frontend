import assert from "node:assert/strict";
import test from "node:test";

import {
  assertQuizAttemptAccess,
  filterEligible,
  getAttemptForLearner,
  getAttemptResultForRoute,
  scoreAttempt,
  submitAttempt,
  validateSubmittedAnswers,
  type LearnerAttemptRepository,
} from "./attempt-service";

const publicQuiz = { id: "public", isPrivate: false };
const lockedQuiz = { id: "locked", isPrivate: true };
const unlockedQuiz = { id: "unlocked", isPrivate: true };

const validationQuestions = [
  { id: "q1", prompt: "First", correctOptionId: "q1-a", options: [{ id: "q1-a", text: "First answer" }] },
  { id: "q2", prompt: "Second", correctOptionId: "q2-a", options: [{ id: "q2-a", text: "Second answer" }] },
];

test("submitted answers retain valid selections and canonical omitted questions", () => {
  assert.deepEqual(validateSubmittedAnswers(validationQuestions, { q1: "q1-a" }), {
    q1: "q1-a",
    q2: undefined,
  });
});

test("submitted answers reject an unknown question key", () => {
  assert.throws(
    () => validateSubmittedAnswers(validationQuestions, { unknown: "q1-a" }),
    new Error("Invalid submitted answers"),
  );
});

test("submitted answers reject an option belonging to another question", () => {
  assert.throws(
    () => validateSubmittedAnswers(validationQuestions, { q1: "q2-a" }),
    new Error("Invalid submitted answers"),
  );
});

test("catalogue eligibility includes public and learner-unlocked quizzes only", () => {
  assert.deepEqual(
    filterEligible([publicQuiz, lockedQuiz, unlockedQuiz], "student-1", [{ quizId: "unlocked", userId: "student-1" }]),
    [publicQuiz, unlockedQuiz],
  );
});

test("submission writes the attempt and every displayed answer through one transaction", async () => {
  const statements: Array<{ sql: string; values: readonly unknown[] }> = [];
  const connection = {
    async execute(sql: string, values: readonly unknown[] = []) {
      statements.push({ sql, values });
      return [];
    },
  };

  const result = await submitAttempt(connection, {
    attemptId: "attempt-1",
    attemptCode: "ATCMH-ATTEMPT-1",
    quizId: "0f6e2d89-1b6b-4e3d-9e55-4d07f6a829b8",
    studentDiscordId: "123456789012345",
    submittedAt: new Date("2026-07-11T08:30:00.000Z"),
    answers: { q1: "a1", q2: "wrong" },
    submissionReason: "manual",
    feedbackMode: "after_submission",
    questions: [
      { id: "q1", prompt: "First", correctOptionId: "a1", options: [{ id: "a1", text: "Correct" }] },
      { id: "q2", prompt: "Second", correctOptionId: "a2", options: [{ id: "a2", text: "Correct" }] },
    ],
  });

  assert.equal(result.score, 1);
  assert.equal(statements.length, 3);
  assert.match(statements[0].sql, /INSERT INTO attempts/);
  assert.match(statements[0].sql, /question_snapshot/);
  assert.match(statements[0].sql, /student_name/);
  assert.doesNotMatch(statements[0].sql, /student_discord_id/);
  assert.match(statements[0].sql, /timed_out/);
  assert.match(statements[0].sql, /submitted_at/);
  assert.equal(statements[0].values[3], "<@123456789012345>");
  assert.equal(statements[0].values[7], "2026-07-11T08:30:00.000Z");
  assert.match(statements[1].sql, /INSERT INTO attempt_answers/);
  assert.match(statements[2].sql, /INSERT INTO attempt_answers/);
});

test("submission preserves the legacy non-null answer layout by omitting unanswered rows", async () => {
  const statements: Array<{ sql: string; values: readonly unknown[] }> = [];
  const submittedAt = new Date("2026-07-11T08:30:00.000Z");
  await submitAttempt({
    async execute(sql, values = []) { statements.push({ sql, values }); return []; },
  }, {
    attemptId: "attempt-2",
    attemptCode: "ATCMH-ATTEMPT-2",
    quizId: "quiz-1",
    studentDiscordId: "123456789012345",
    submittedAt,
    answers: {},
    submissionReason: "timeout",
    feedbackMode: "none",
    questions: [{ id: "q1", prompt: "First", correctOptionId: "a1", options: [{ id: "a1", text: "Correct" }] }],
  });

  assert.equal(statements.length, 1);
});

type SubmitAttemptInput = Parameters<typeof submitAttempt>[1];
// @ts-expect-error submitAttempt only accepts trusted server-created Date values.
const invalidSubmittedAt: SubmitAttemptInput["submittedAt"] = "2026-07-11T08:30:00.000Z";
void invalidSubmittedAt;

test("attempt results cannot be read by a different learner", async () => {
  const repository: LearnerAttemptRepository = {
    async findAttempt() {
      return { id: "attempt-1", studentDiscordId: "student-1", quizId: "quiz-1", score: 1, total: 1, percentage: 100, questionSnapshot: [], submissionReason: "manual" };
    },
  };

  await assert.rejects(() => getAttemptForLearner(repository, "attempt-1", "different-user"), /not available/);
});

test("server-authorized reviewers can read another learner's attempt", async () => {
  const repository: LearnerAttemptRepository = {
    async findAttempt() {
      return { id: "attempt-1", studentDiscordId: null, quizId: "quiz-1", score: 14, total: 25, percentage: 56, questionSnapshot: [], submissionReason: "timeout" };
    },
  };

  const attempt = await getAttemptResultForRoute(repository, "attempt-1", "reviewer-1", true);

  assert.equal(attempt.id, "attempt-1");
});

test("legacy attempts derived from the stored Discord mention are ownership-verified", async () => {
  const repository: LearnerAttemptRepository = {
    async findAttempt() {
      return { id: "attempt-1", studentDiscordId: "student-1", quizId: "quiz-1", score: 1, total: 1, percentage: 100, questionSnapshot: [], submissionReason: "manual" };
    },
  };
  const attempt = await getAttemptForLearner(repository, "attempt-1", "student-1");
  assert.equal(attempt.id, "attempt-1");
});

test("result routes reject before querying when no verified Discord subject exists", async () => {
  let called = false;
  const repository: LearnerAttemptRepository = {
    async findAttempt() { called = true; return null; },
  };
  await assert.rejects(() => getAttemptResultForRoute(repository, "attempt-1", undefined), /not available/);
  assert.equal(called, false);
});

test("a direct private attempt route requires a matching verified learner unlock", () => {
  assert.throws(() => assertQuizAttemptAccess({ id: "private", isPrivate: true }, undefined, []), /not available/);
  assert.throws(() => assertQuizAttemptAccess({ id: "private", isPrivate: true }, "student-1", []), /not available/);
  assert.doesNotThrow(() => assertQuizAttemptAccess({ id: "private", isPrivate: true }, "student-1", [{ quizId: "private", userId: "student-1" }]));
  assert.doesNotThrow(() => assertQuizAttemptAccess({ id: "public", isPrivate: false }, undefined, []));
});

test("scores displayed questions, snapshots their canonical IDs, and uses integer percentage", () => {
  const result = scoreAttempt({
    quizId: "0f6e2d89-1b6b-4e3d-9e55-4d07f6a829b8",
    answers: { q1: "a1", q2: "wrong" },
    questions: [
      { id: "q1", prompt: "First", correctOptionId: "a1", options: [{ id: "a1", text: "Correct" }] },
      { id: "q2", prompt: "Second", correctOptionId: "a2", options: [{ id: "a2", text: "Correct" }] },
      { id: "q3", prompt: "Third", correctOptionId: "a3", options: [{ id: "a3", text: "Correct" }] },
    ],
    submissionReason: "timeout",
    feedbackMode: "after_submission",
  });

  assert.deepEqual(result, {
    score: 1,
    total: 3,
    percentage: 33,
    submissionReason: "timeout",
    questionSnapshot: {
      version: 2,
      feedbackMode: "after_submission",
      questions: [
        { id: "q1", prompt: "First", options: [{ id: "a1", text: "Correct" }], selectedOptionId: "a1", correctOptionId: "a1" },
        { id: "q2", prompt: "Second", options: [{ id: "a2", text: "Correct" }], selectedOptionId: "wrong", correctOptionId: "a2" },
        { id: "q3", prompt: "Third", options: [{ id: "a3", text: "Correct" }], selectedOptionId: null, correctOptionId: "a3" },
      ],
    },
    answerRows: [
      { questionId: "q1", selectedOptionId: "a1", isCorrect: true },
      { questionId: "q2", selectedOptionId: "wrong", isCorrect: false },
      { questionId: "q3", selectedOptionId: null, isCorrect: false },
    ],
  });
});
