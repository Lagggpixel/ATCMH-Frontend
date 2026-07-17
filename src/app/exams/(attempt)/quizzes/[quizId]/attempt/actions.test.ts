import assert from "node:assert/strict";
import test from "node:test";

import { attemptIdForStart } from "@/src/lib/attempt-start-contract";
import { executeLearnerSubmission, type LearnerSubmissionDependencies, type LearnerSubmissionInput } from "./actions";

const quiz = {
  id: "c2a07cd2-3e2e-482e-b2ee-9d5c6fec6bc4",
  title: "Tower Basics",
  description: "",
  categoryId: "category-1",
  category: "Basics",
  feedbackMode: "after_submission",
  timeLimitSeconds: 600,
  randomizeQuestions: false,
  isPrivate: false,
  tags: [],
  bankDraws: [],
  questions: [
    { id: "q1", prompt: "First", correctOptionId: "a1", sortOrder: 1, randomizeOptions: false, options: [{ id: "a1", text: "Correct", sortOrder: 1 }] },
  ],
};

const input: LearnerSubmissionInput = {
  quizId: quiz.id,
  answers: { q1: "a1" },
  submissionReason: "manual",
};

const attemptStart = {
  discordId: "123456789012345678",
  quizId: quiz.id,
  nonce: "nonce-a",
  startedAt: 1_783_758_000,
  deadline: 1_783_759_200,
};
const attemptId = attemptIdForStart(attemptStart);

function dependencies(overrides: Partial<LearnerSubmissionDependencies> = {}): LearnerSubmissionDependencies {
  return {
    getVerifiedLearnerIdentity: async () => ({ discordId: "123456789012345678", displayName: "Verified learner" }),
    resolveLearnerAccess: async (discordId) => ({ discordId, canAccessPrivateQuizzes: false }),
    getQuizForLearner: async () => quiz,
    getVerifiedAttemptStart: async () => attemptStart,
    getAttemptByReference: async () => null,
    validateSubmittedAnswers: (_questions, answers) => ({ ...answers }),
    withWriteTransaction: async (fn) => fn({ execute: async () => [] }),
    submitAttempt: async () => ({ score: 1, total: 1, percentage: 100, submissionReason: "manual", questionSnapshot: [], answerRows: [] }),
    now: () => new Date("2026-07-11T08:30:00.000Z"),
    logSubmissionFailure: () => undefined,
    ...overrides,
  };
}

test("submission resolves trusted staff access and passes it to canonical quiz authorization", async () => {
  const events: string[] = [];
  const trustedContext = { discordId: "123456789012345678", canAccessPrivateQuizzes: true };

  const result = await executeLearnerSubmission(dependencies({
    resolveLearnerAccess: async (discordId) => {
      events.push(`resolve:${discordId}`);
      return trustedContext;
    },
    getQuizForLearner: async (quizId, context) => {
      events.push(`authorize:${quizId}`);
      assert.equal(context, trustedContext);
      return quiz;
    },
  }), {
    ...input,
    canAccessPrivateQuizzes: false,
    roles: ["forged-browser-role"],
  } as LearnerSubmissionInput);

  assert.ok("attemptId" in result);
  assert.deepEqual(events.slice(0, 2), [`resolve:${trustedContext.discordId}`, `authorize:${quiz.id}`]);
  assert.equal("canAccessPrivateQuizzes" in input, false);
  assert.equal("roles" in input, false);
});

test("a missing or mismatched signed attempt start rejects before writing", async () => {
  let wrote = false;
  const result = await executeLearnerSubmission(dependencies({
    getVerifiedAttemptStart: async () => undefined,
    withWriteTransaction: async (fn) => { wrote = true; return fn({ execute: async () => [] }); },
  }), input);

  assert.deepEqual(result, { error: "Unable to submit attempt." });
  assert.equal(wrote, false);
});

test("the server rejects manual submission after the signed deadline", async () => {
  let wrote = false;
  const result = await executeLearnerSubmission(dependencies({
    now: () => new Date(1_783_759_201_000),
    withWriteTransaction: async (fn) => { wrote = true; return fn({ execute: async () => [] }); },
  }), input);

  assert.deepEqual(result, { error: "Unable to submit attempt." });
  assert.equal(wrote, false);
});

test("the server persists an expired timeout and derives its reason", async () => {
  let reason: string | undefined;
  let auditEvent: Parameters<NonNullable<LearnerSubmissionDependencies["sendAttemptAuditEvent"]>>[0] | undefined;
  const result = await executeLearnerSubmission(dependencies({
    now: () => new Date(1_783_759_201_000),
    submitAttempt: async (_connection, submitted) => {
      reason = submitted.submissionReason;
      return { score: 1, total: 1, percentage: 100, submissionReason: "timeout", questionSnapshot: [], answerRows: [] };
    },
    sendAttemptAuditEvent: async (event) => { auditEvent = event; },
  }), { ...input, submissionReason: "timeout" });

  assert.ok("attemptId" in result);
  assert.equal(reason, "timeout");
  assert.equal(auditEvent?.action, "exam.attempt.timed_out");
  assert.equal(auditEvent?.details?.quizTitle, quiz.title);
  assert.equal(auditEvent?.details?.attemptCode, attemptId.replace(/-/g, ""));
});

test("the server rejects a forged early timeout request", async () => {
  let wrote = false;
  const result = await executeLearnerSubmission(dependencies({
    withWriteTransaction: async (fn) => { wrote = true; return fn({ execute: async () => [] }); },
  }), { ...input, submissionReason: "timeout" });

  assert.deepEqual(result, { error: "Unable to submit attempt." });
  assert.equal(wrote, false);
});

test("missing learner identity rejects before quiz access or a write", async () => {
  let quizRead = false;
  let wrote = false;
  const result = await executeLearnerSubmission(dependencies({
    getVerifiedLearnerIdentity: async () => undefined,
    getQuizForLearner: async () => { quizRead = true; return quiz; },
    withWriteTransaction: async (fn) => { wrote = true; return fn({ execute: async () => [] }); },
  }), input);

  assert.deepEqual(result, { error: "Unable to submit attempt." });
  assert.equal(quizRead, false);
  assert.equal(wrote, false);
});

test("an unavailable quiz rejects without opening a write transaction", async () => {
  let wrote = false;
  const result = await executeLearnerSubmission(dependencies({
    getQuizForLearner: async () => null,
    withWriteTransaction: async (fn) => { wrote = true; return fn({ execute: async () => [] }); },
  }), input);

  assert.deepEqual(result, { error: "Unable to submit attempt." });
  assert.equal(wrote, false);
});

test("invalid submitted answers reject without opening a write transaction", async () => {
  let wrote = false;
  const result = await executeLearnerSubmission(dependencies({
    validateSubmittedAnswers: () => { throw new Error("specific validation detail"); },
    withWriteTransaction: async (fn) => { wrote = true; return fn({ execute: async () => [] }); },
  }), input);

  assert.deepEqual(result, { error: "Unable to submit attempt." });
  assert.equal(wrote, false);
});

test("an invalid submission reason rejects before any transaction, write, or audit delivery", async () => {
  const events: string[] = [];
  const invalidInput = { ...input, submissionReason: "scheduled" } as unknown as LearnerSubmissionInput;
  const result = await executeLearnerSubmission(dependencies({
    withWriteTransaction: async (fn) => {
      events.push("transaction-start");
      return fn({ execute: async () => [] });
    },
    submitAttempt: async () => {
      events.push("attempt-written");
      return { score: 1, total: 1, percentage: 100, submissionReason: "manual", questionSnapshot: [], answerRows: [] };
    },
    sendAttemptAuditEvent: async () => {
      events.push("audit-sent");
    },
  }), invalidInput);

  assert.deepEqual(result, { error: "Unable to submit attempt." });
  assert.deepEqual(events, []);
});

test("a valid request submits inside the transaction and emits its audit after commit", async () => {
  const events: string[] = [];
  let submittedInput: Parameters<LearnerSubmissionDependencies["submitAttempt"]>[1] | undefined;
  let nowCalls = 0;
  const result = await executeLearnerSubmission(dependencies({
    withWriteTransaction: async (fn) => {
      events.push("transaction-start");
      const value = await fn({ execute: async () => [] });
      events.push("transaction-committed");
      return value;
    },
    submitAttempt: async (_connection, submitted) => {
      events.push("attempt-written");
      submittedInput = submitted;
      return { score: 1, total: 1, percentage: 100, submissionReason: "manual", questionSnapshot: [], answerRows: [] };
    },
    sendAttemptAuditEvent: async (event) => {
      events.push("audit-sent");
      assert.equal(event.details?.quizTitle, quiz.title);
      assert.equal(event.details?.attemptCode, attemptId.replace(/-/g, ""));
      assert.equal(event.details?.submittedAt, "2026-07-11T08:30:00.000Z");
    },
    now: () => {
      nowCalls += 1;
      return new Date("2026-07-11T08:30:00.000Z");
    },
  }), input);

  assert.deepEqual(result, { attemptId });
  assert.deepEqual(events, ["transaction-start", "attempt-written", "transaction-committed", "audit-sent"]);
  assert.equal(submittedInput?.attemptCode, attemptId.replace(/-/g, ""));
  assert.equal(submittedInput?.feedbackMode, "after_submission");
  assert.equal(submittedInput?.submittedAt.toISOString(), "2026-07-11T08:30:00.000Z");
  assert.equal(nowCalls, 1);
});

test("a committed attempt emits the matching manual audit event without answers", async () => {
  const events: unknown[] = [];
  const result = await executeLearnerSubmission({
    ...dependencies(),
    sendAttemptAuditEvent: async (event) => { events.push(event); },
  }, input);

  assert.ok("attemptId" in result);
  assert.deepEqual(events, [{
    action: "exam.attempt.submitted",
    actorId: "123456789012345678",
    targetType: "attempt",
    targetId: attemptId,
    summary: "Learner submitted a quiz attempt.",
    details: {
      quizId: quiz.id,
      quizTitle: quiz.title,
      attemptCode: attemptId.replace(/-/g, ""),
      learnerDiscordId: "123456789012345678",
      score: 1,
      total: 1,
      percentage: 100,
      submissionReason: "manual",
      submittedAt: "2026-07-11T08:30:00.000Z",
    },
  }]);
  assert.equal(JSON.stringify(events).includes("answers"), false);
});

test("an impersonated attempt audit attributes the real actor and preserves the learner target", async () => {
  const events: any[] = [];
  await executeLearnerSubmission(dependencies({
    getVerifiedLearnerIdentity: async () => ({
      accountId: "42", discordId: "123456789012345678", displayName: "Target learner", impersonating: true,
      realActorAccountId: "7", realActorDiscordId: "999999999999999999",
    }),
    sendAttemptAuditEvent: async (event) => { events.push(event); },
  }), input);
  assert.equal(events[0].actorId, "999999999999999999");
  assert.equal(events[0].details.realActorAccountId, "7");
  assert.equal(events[0].details.impersonatedAccountId, "42");
  assert.equal(events[0].details.impersonatedDiscordId, "123456789012345678");
});

test("submission normalizes the database end feedback value into the version-two review contract", async () => {
  let feedbackMode: string | undefined;
  await executeLearnerSubmission(dependencies({
    getQuizForLearner: async () => ({ ...quiz, feedbackMode: "end" }),
    submitAttempt: async (_connection, submitted) => {
      feedbackMode = submitted.feedbackMode;
      return { score: 1, total: 1, percentage: 100, submissionReason: "manual", questionSnapshot: [], answerRows: [] };
    },
  }), input);

  assert.equal(feedbackMode, "after_submission");
});

test("submission rejects an unknown persisted feedback value before opening a write transaction", async () => {
  let wrote = false;
  const result = await executeLearnerSubmission(dependencies({
    getQuizForLearner: async () => ({ ...quiz, feedbackMode: "disabled" }),
    withWriteTransaction: async (fn) => { wrote = true; return fn({ execute: async () => [] }); },
  }), input);

  assert.deepEqual(result, { error: "Unable to submit attempt." });
  assert.equal(wrote, false);
});

test("a caught write failure logs only its stage and safe database classification", async () => {
  const logs: unknown[][] = [];
  const failure = Object.assign(new Error("secret SQL and submitted answers"), {
    code: "ER_NO_DEFAULT_FOR_FIELD",
    sql: "INSERT secret",
    sqlMessage: "contains private payload",
  });

  const result = await executeLearnerSubmission(dependencies({
    submitAttempt: async () => { throw failure; },
    logSubmissionFailure: (...args) => { logs.push(args); },
  }), input);

  assert.deepEqual(result, { error: "Unable to submit attempt." });
  assert.deepEqual(logs, [["persist_attempt", { errorClass: "Error", errorCode: "ER_NO_DEFAULT_FOR_FIELD" }]]);
  assert.equal(JSON.stringify(logs).includes("secret"), false);
  assert.equal(JSON.stringify(logs).includes("answers"), false);
});

test("a duplicate submission returns the matching committed attempt without another audit event", async () => {
  const start = await dependencies().getVerifiedAttemptStart("123456789012345678", quiz.id);
  assert.ok(start);
  const duplicateAttemptId = attemptIdForStart(start);
  let auditSent = false;
  let lookupReference: string | undefined;
  const result = await executeLearnerSubmission(Object.assign(dependencies({
    submitAttempt: async () => { throw Object.assign(new Error("duplicate attempt"), { code: "ER_DUP_ENTRY" }); },
    sendAttemptAuditEvent: async () => { auditSent = true; },
  }), {
    getAttemptByReference: async (reference: string) => {
      lookupReference = reference;
      return {
        id: reference,
        studentDiscordId: "123456789012345678",
        quizId: quiz.id,
        score: 1,
        total: 1,
        percentage: 100,
        questionSnapshot: {},
        submissionReason: "manual" as const,
      };
    },
  }), input);

  assert.deepEqual(result, { attemptId: duplicateAttemptId });
  assert.equal(lookupReference, duplicateAttemptId);
  assert.equal(auditSent, false);
});

test("a duplicate submission rejects an attempt owned by a different learner", async () => {
  const result = await executeLearnerSubmission(Object.assign(dependencies({
    submitAttempt: async () => { throw Object.assign(new Error("duplicate attempt"), { code: "ER_DUP_ENTRY" }); },
  }), {
    getAttemptByReference: async (reference: string) => ({
      id: reference,
      studentDiscordId: "999999999999999999",
      quizId: quiz.id,
      score: 1,
      total: 1,
      percentage: 100,
      questionSnapshot: {},
      submissionReason: "manual" as const,
    }),
  }), input);

  assert.deepEqual(result, { error: "Unable to submit attempt." });
});

test("a duplicate submission rejects an attempt for a different quiz", async () => {
  const result = await executeLearnerSubmission(Object.assign(dependencies({
    submitAttempt: async () => { throw Object.assign(new Error("duplicate attempt"), { code: "ER_DUP_ENTRY" }); },
  }), {
    getAttemptByReference: async (reference: string) => ({
      id: reference,
      studentDiscordId: "123456789012345678",
      quizId: "5eb6cf2c-3e2e-482e-b2ee-9d5c6fec6bc4",
      score: 1,
      total: 1,
      percentage: 100,
      questionSnapshot: {},
      submissionReason: "manual" as const,
    }),
  }), input);

  assert.deepEqual(result, { error: "Unable to submit attempt." });
});

test("a logging failure cannot replace the generic submission error", async () => {
  const result = await executeLearnerSubmission(dependencies({
    submitAttempt: async () => { throw new Error("database failure"); },
    logSubmissionFailure: () => { throw new Error("logger failure"); },
  }), input);

  assert.deepEqual(result, { error: "Unable to submit attempt." });
});

test("browser-supplied identity fields are ignored in favor of the verified session", async () => {
  let submittedInput: Parameters<LearnerSubmissionDependencies["submitAttempt"]>[1] | undefined;
  const tamperedInput = {
    ...input,
    studentDiscordId: "999999999999999999",
  } as LearnerSubmissionInput;

  await executeLearnerSubmission(dependencies({
    submitAttempt: async (_connection, submitted) => {
      submittedInput = submitted;
      return { score: 1, total: 1, percentage: 100, submissionReason: "manual", questionSnapshot: [], answerRows: [] };
    },
  }), tamperedInput);

  assert.equal(submittedInput?.studentDiscordId, "123456789012345678");
  assert.equal("studentDiscordId" in input, false);
});

test("audit delivery rejection does not fail a committed attempt", async () => {
  const result = await executeLearnerSubmission(dependencies({
    sendAttemptAuditEvent: async () => { throw new Error("delivery failed"); },
  }), input);

  assert.deepEqual(result, { attemptId });
});
