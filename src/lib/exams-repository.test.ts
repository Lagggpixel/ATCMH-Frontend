import assert from "node:assert/strict";
import test from "node:test";

import { getAttemptByReference, getQuiz, getQuizForLearner, isQuizId, listEligibleQuizzes, listPublicQuizzes, parseAttemptStudentDiscordId, setReadOnlyQueryForTests } from "./exams-repository";

test("quiz IDs must be UUID-like before a query is issued", async () => {
  let called = false;
  setReadOnlyQueryForTests(async () => {
    called = true;
    return [];
  });

  await assert.rejects(() => listEligibleQuizzes({ discordId: "not a discord id", canAccessPrivateQuizzes: false }), /Discord IDs/);
  assert.equal(called, false);
});

test("public catalogue query never includes private quizzes", async () => {
  let sql = "";
  setReadOnlyQueryForTests(async (statement) => {
    sql = statement;
    return [];
  });
  await listPublicQuizzes();
  assert.match(sql, /is_private = FALSE/);
});

test("accepts UUID-like quiz IDs", () => {
  assert.equal(isQuizId("c2a07cd2-3e2e-482e-b2ee-9d5c6fec6bc4"), true);
  assert.equal(isQuizId("not-a-quiz-id"), false);
});

test("invalid quiz IDs are rejected before a database query", async () => {
  let called = false;
  setReadOnlyQueryForTests(async () => {
    called = true;
    return [];
  });

  await assert.rejects(() => getQuiz("not-a-quiz-id"), /Quiz IDs/);
  assert.equal(called, false);
});

test("attempt reads derive ownership from the legacy Discord mention", async () => {
  setReadOnlyQueryForTests(async (sql) => sql.includes("FROM attempt_answers") ? [] : [{
    id: "attempt-1", student_name: "<@123456789012345>", quiz_id: "quiz-1", score: 1, total: 1, percentage: 100,
    question_snapshot: "[]", submission_reason: "manual",
  }]);
  const attempt = await getAttemptByReference("11111111-2222-4333-8444-555555555555");
  assert.equal(attempt?.studentDiscordId, "123456789012345");
});

test("attempt reads retain ownership for interim display-name rows", async () => {
  setReadOnlyQueryForTests(async () => [{
    id: "attempt-1", student_name: "AsianSuccess", student_discord_id: "123456789012345678",
    quiz_id: "quiz-1", score: 0, total: 10, percentage: 0,
    question_snapshot: { version: 2, feedbackMode: "none", questions: [] }, submission_reason: "timeout",
  }]);

  const attempt = await getAttemptByReference("75d03c1b-34a9-49dc-aa66-b5e5ac684075");

  assert.equal(attempt?.studentDiscordId, "123456789012345678");
});

test("attempt identity parsing accepts only complete legacy mentions or snowflakes", () => {
  assert.equal(parseAttemptStudentDiscordId("<@!123456789012345>", undefined), "123456789012345");
  assert.equal(parseAttemptStudentDiscordId("Legacy Display 123456789012345", undefined), null);
  assert.equal(parseAttemptStudentDiscordId("Legacy Display", "123456789012345"), "123456789012345");
});

test("attempt reads merge the legacy snapshot and answer rows without mutable quiz content", async () => {
  setReadOnlyQueryForTests(async (sql) => {
    if (sql.includes("FROM attempt_answers")) {
      return [{ question_id: "q1", selected_option_id: "wrong", correct: 0 }];
    }
    return [{
      id: "attempt-1", student_name: "<@!123456789012345>", quiz_id: "quiz-1", score: 0, total: 1, percentage: 0,
      question_snapshot: JSON.stringify([{ id: "q1", prompt: "Legacy question", correctOptionId: "right", options: [
        { id: "right", text: "Right" }, { id: "wrong", text: "Wrong" },
      ] }]), submission_reason: "manual",
    }];
  });

  const attempt = await getAttemptByReference("11111111222243338444555555555555");

  assert.deepEqual(attempt?.questionSnapshot, {
    version: 2,
    feedbackMode: "after_submission",
    questions: [{
      id: "q1", prompt: "Legacy question", correctOptionId: "right", selectedOptionId: "wrong", selectedIsCorrect: false,
      options: [{ id: "right", text: "Right" }, { id: "wrong", text: "Wrong" }],
    }],
  });
});

test("attempt reads normalize early prompt-and-option-ID snapshots into a safe detailed review", async () => {
  setReadOnlyQueryForTests(async (sql) => {
    if (sql.includes("FROM attempt_answers")) {
      return [{ question_id: "q1", selected_option_id: "option-b", correct: 0 }];
    }
    return [{
      id: "attempt-1", student_name: "AsianSuccess", student_discord_id: "123456789012345678",
      quiz_id: "quiz-1", score: 0, total: 1, percentage: 0,
      question_snapshot: JSON.stringify([{ id: "q1", prompt: "Early question", optionIds: ["option-a", "option-b"] }]),
      submission_reason: "timeout",
    }];
  });

  const attempt = await getAttemptByReference("75d03c1b-34a9-49dc-aa66-b5e5ac684075");

  assert.deepEqual(attempt?.questionSnapshot, {
    version: 2,
    feedbackMode: "after_submission",
    questions: [{
      id: "q1", prompt: "Early question", correctOptionId: null, selectedOptionId: "option-b", selectedIsCorrect: false,
      options: [{ id: "option-a", text: "Stored option 1" }, { id: "option-b", text: "Stored option 2" }],
    }],
  });
});

test("attempt reads preserve a recorded legacy selection whose option text is missing", async () => {
  setReadOnlyQueryForTests(async (sql) => {
    if (sql.includes("FROM attempt_answers")) {
      return [{ question_id: "q1", selected_option_id: "removed-option", correct: 0 }];
    }
    return [{
      id: "attempt-1", student_name: "<@123456789012345678>", quiz_id: "quiz-1",
      score: 0, total: 1, percentage: 0,
      question_snapshot: JSON.stringify([{ id: "q1", prompt: "Legacy question", correctOptionId: "right", options: [
        { id: "right", text: "Right" },
      ] }]), submission_reason: "timeout",
    }];
  });

  const attempt = await getAttemptByReference("5a8df97006994b0fab1adae90e38cee6");

  assert.deepEqual((attempt?.questionSnapshot as { questions: Array<{ options: unknown[] }> }).questions[0].options, [
    { id: "right", text: "Right" },
    { id: "removed-option", text: "Recorded answer (option text unavailable)" },
  ]);
});

test("attempt lookup accepts UUID IDs and exact 32-character legacy codes", async () => {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  setReadOnlyQueryForTests(async (sql, values) => { calls.push({ sql, values }); return []; });
  await getAttemptByReference("11111111-2222-4333-8444-555555555555");
  await getAttemptByReference("11111111222243338444555555555555");
  assert.match(calls[0].sql, /WHERE id = \?/);
  assert.deepEqual(calls[0].values, ["11111111-2222-4333-8444-555555555555"]);
  assert.match(calls[1].sql, /WHERE code = \?/);
  assert.deepEqual(calls[1].values, ["11111111222243338444555555555555"]);
});

test("attempt lookup normalizes accepted legacy codes to their canonical lowercase form", async () => {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  setReadOnlyQueryForTests(async (sql, values) => { calls.push({ sql, values }); return []; });

  await getAttemptByReference("ABCDEF0123456789ABCDEF0123456789");

  assert.match(calls[0].sql, /WHERE code = \?/);
  assert.deepEqual(calls[0].values, ["abcdef0123456789abcdef0123456789"]);
});

test("attempt lookup rejects ambiguous references before querying", async () => {
  let called = false;
  setReadOnlyQueryForTests(async () => { called = true; return []; });
  await assert.rejects(() => getAttemptByReference("not-an-attempt"), /reference/);
  assert.equal(called, false);
});

test("staff catalogue includes every quiz without checking unlocks", async () => {
  let sql = "";
  let parameters: unknown[] | undefined;
  setReadOnlyQueryForTests(async (statement, values) => {
    sql = statement;
    parameters = values;
    return [];
  });

  await listEligibleQuizzes({ discordId: "12345678901234567", canAccessPrivateQuizzes: true });

  assert.doesNotMatch(sql, /WHERE|quiz_unlocks/);
  assert.equal(parameters, undefined);
});

test("ordinary learner catalogue remains public or exactly their own unlocks", async () => {
  let sql = "";
  let parameters: unknown[] | undefined;
  setReadOnlyQueryForTests(async (statement, values) => {
    sql = statement;
    parameters = values;
    return [];
  });

  await listEligibleQuizzes({ discordId: "12345678901234567", canAccessPrivateQuizzes: false });

  assert.match(sql, /q\.is_private = FALSE/);
  assert.match(sql, /u\.quiz_id = q\.id AND u\.user_id = \?/);
  assert.deepEqual(parameters, ["12345678901234567"]);
});

test("staff can open private quizzes without an unlock query", async () => {
  const quizId = "c2a07cd2-3e2e-482e-b2ee-9d5c6fec6bc4";
  const statements: string[] = [];
  setReadOnlyQueryForTests(async (statement) => {
    statements.push(statement);
    if (statement.includes("FROM quizzes q JOIN categories")) {
      return [{
        id: quizId, title: "Private quiz", description: "", category_id: "category-1",
        category_name: "Category", feedback_mode: "immediate", time_limit_seconds: 60,
        randomize_questions: 0, is_private: 1,
      }];
    }
    return [];
  });

  const quiz = await getQuizForLearner(quizId, { discordId: "12345678901234567", canAccessPrivateQuizzes: true });

  assert.equal(quiz?.id, quizId);
  assert.equal(statements.some((statement) => statement.includes("quiz_unlocks")), false);
});

test("ordinary private quiz lookup checks the exact learner unlock", async () => {
  const quizId = "c2a07cd2-3e2e-482e-b2ee-9d5c6fec6bc4";
  const calls: Array<{ statement: string; values?: unknown[] }> = [];
  setReadOnlyQueryForTests(async (statement, values) => {
    calls.push({ statement, values });
    if (statement.includes("SELECT id, is_private")) return [{ id: quizId, is_private: 1 }];
    if (statement.includes("quiz_unlocks")) return [];
    return [];
  });

  await assert.rejects(
    () => getQuizForLearner(quizId, { discordId: "12345678901234567", canAccessPrivateQuizzes: false }),
    /available/,
  );

  const unlock = calls.find((call) => call.statement.includes("quiz_unlocks"));
  assert.match(unlock?.statement ?? "", /quiz_id = \? AND user_id = \? LIMIT 1/);
  assert.deepEqual(unlock?.values, [quizId, "12345678901234567"]);
});

test("public quiz lookup remains available without an unlock query", async () => {
  const quizId = "c2a07cd2-3e2e-482e-b2ee-9d5c6fec6bc4";
  const statements: string[] = [];
  setReadOnlyQueryForTests(async (statement) => {
    statements.push(statement);
    if (statement.includes("SELECT id, is_private")) return [{ id: quizId, is_private: 0 }];
    if (statement.includes("FROM quizzes q JOIN categories")) {
      return [{
        id: quizId, title: "Public quiz", description: "", category_id: "category-1",
        category_name: "Category", feedback_mode: "immediate", time_limit_seconds: 60,
        randomize_questions: 0, is_private: 0,
      }];
    }
    return [];
  });

  const quiz = await getQuizForLearner(quizId, { discordId: "12345678901234567", canAccessPrivateQuizzes: false });

  assert.equal(quiz?.id, quizId);
  assert.equal(statements.some((statement) => statement.includes("quiz_unlocks")), false);
});

test("private quiz lookup requires a server-verified Discord snowflake", async () => {
  let calls = 0;
  setReadOnlyQueryForTests(async () => {
    calls += 1;
    return [{ id: "c2a07cd2-3e2e-482e-b2ee-9d5c6fec6bc4", is_private: 1 }];
  });
  await assert.rejects(
    () => getQuizForLearner("c2a07cd2-3e2e-482e-b2ee-9d5c6fec6bc4", { discordId: "invalid", canAccessPrivateQuizzes: false }),
    /Discord IDs/,
  );
  assert.equal(calls, 0);
});
