import assert from "node:assert/strict";
import test from "node:test";

import { queryReadOnly, setPoolForTests, setWritePoolForTests } from "./db";
import { setReadOnlyQueryForTests } from "./exams-repository";
import { deleteManagementAttempt, getManagementAttempt, listManagementAttemptPage, listManagementAttempts } from "./management-attempts";

const attemptId = "11111111-2222-4333-8444-555555555555";

function restoreDatabaseSeams() {
  setPoolForTests(undefined);
  setWritePoolForTests(undefined);
}

test("management attempts list joins quiz titles, preserves legacy identities, and orders newest first", async () => {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  setPoolForTests({
    execute: async (sql: string, values?: unknown[]) => {
      calls.push({ sql, values });
      return [[
        {
          id: "attempt-new", code: "A".repeat(32), quiz_id: "quiz-new", quiz_title: "Newest quiz",
          student_name: "<@!123456789012345>", score: 8, total: 10, percentage: 80,
          submitted_at: "2026-07-12T12:00:00.000Z", timed_out: 0, submission_reason: "manual",
        },
        {
          id: "attempt-old", code: "b".repeat(32), quiz_id: "quiz-old", quiz_title: "Legacy quiz",
          student_name: "Legacy Display Name", student_discord_id: "123456789012345678", score: 3, total: 10, percentage: 30,
          submitted_at: null, timed_out: 1, submission_reason: "manual",
        },
      ]] as never;
    },
  } as never);

  try {
    const attempts = await listManagementAttempts({ limit: 25, offset: 50 });

    assert.deepEqual(attempts, [
      {
        id: "attempt-new", code: "a".repeat(32), quizId: "quiz-new", quizTitle: "Newest quiz",
        studentName: "<@!123456789012345>", studentDiscordId: "123456789012345",
        score: 8, total: 10, percentage: 80, submittedAt: "2026-07-12T12:00:00.000Z",
        status: "submitted", submissionReason: "manual",
      },
      {
        id: "attempt-old", code: "b".repeat(32), quizId: "quiz-old", quizTitle: "Legacy quiz",
        studentName: "Legacy Display Name", studentDiscordId: "123456789012345678",
        score: 3, total: 10, percentage: 30, submittedAt: null,
        status: "timed_out", submissionReason: "timeout",
      },
    ]);
    assert.match(calls[0].sql, /JOIN quizzes ON quizzes\.id = attempts\.quiz_id/);
    assert.match(calls[0].sql, /ORDER BY attempts\.submitted_at DESC, attempts\.id DESC/);
    assert.deepEqual(calls[0].values, [25, 50]);
  } finally {
    restoreDatabaseSeams();
  }
});

test("management attempt pages search names or quiz titles and return count metadata", async () => {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  setPoolForTests({
    execute: async (sql: string, values?: unknown[]) => {
      calls.push({ sql, values });
      if (sql.includes("COUNT(*) AS total")) return [[{ total: 11 }]] as never;
      return [[{
        id: "attempt-1", code: "d".repeat(32), quiz_id: "quiz-1", quiz_title: "Tower Fundamentals",
        student_name: "Aviation Student", student_discord_id: "123456789012345", score: 7, total: 10, percentage: 70,
        submitted_at: "2026-07-12T12:00:00.000Z", timed_out: 0, submission_reason: "manual",
      }]] as never;
    },
  } as never);

  try {
    const result = await listManagementAttemptPage({ page: 3, pageSize: 5, query: "Tower" });

    assert.deepEqual(result, {
      attempts: [{
        id: "attempt-1", code: "d".repeat(32), quizId: "quiz-1", quizTitle: "Tower Fundamentals",
        studentName: "Aviation Student", studentDiscordId: "123456789012345",
        score: 7, total: 10, percentage: 70, submittedAt: "2026-07-12T12:00:00.000Z",
        status: "submitted", submissionReason: "manual",
      }],
      page: 3,
      pageSize: 5,
      total: 11,
    });
    assert.equal(calls.length, 2);
    for (const call of calls) {
      assert.match(call.sql, /LOWER\(attempts\.student_name\) LIKE LOWER\(\?\)/);
      assert.match(call.sql, /LOWER\(quizzes\.title\) LIKE LOWER\(\?\)/);
      assert.deepEqual(call.values?.slice(0, 4), Array(4).fill("%Tower%"));
    }
    assert.deepEqual(calls[1].values, ["%Tower%", "%Tower%", "%Tower%", "%Tower%", 5, 10]);
  } finally {
    restoreDatabaseSeams();
  }
});

test("management attempt page search also matches legacy mentions, stored Discord IDs, and attempt codes", async () => {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  setPoolForTests({
    execute: async (sql: string, values?: unknown[]) => {
      calls.push({ sql, values });
      return [sql.includes("COUNT(*) AS total") ? [{ total: 1 }] : []] as never;
    },
  } as never);

  try {
    await listManagementAttemptPage({ page: 1, pageSize: 10, query: "123456789012345" });

    for (const call of calls) {
      assert.match(call.sql, /LOWER\(attempts\.student_name\) LIKE LOWER\(\?\)/);
      assert.match(call.sql, /LOWER\(attempts\.student_discord_id\) LIKE LOWER\(\?\)/);
      assert.match(call.sql, /LOWER\(attempts\.code\) LIKE LOWER\(\?\)/);
      assert.deepEqual(call.values?.slice(0, 4), Array(4).fill("%123456789012345%"));
    }
  } finally {
    restoreDatabaseSeams();
  }
});

test("management attempt page rejects invalid pagination before querying", async () => {
  let called = false;
  setPoolForTests({ execute: async () => { called = true; return [[]] as never; } } as never);

  try {
    await assert.rejects(() => listManagementAttemptPage({ page: 0, pageSize: 20 }), /page/);
    await assert.rejects(() => listManagementAttemptPage({ page: 1, pageSize: 101 }), /page size/);
    assert.equal(called, false);
  } finally {
    restoreDatabaseSeams();
  }
});

test("management attempt page omits search predicates for an empty query", async () => {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  setPoolForTests({
    execute: async (sql: string, values?: unknown[]) => {
      calls.push({ sql, values });
      return [sql.includes("COUNT(*) AS total") ? [{ total: 0 }] : []] as never;
    },
  } as never);

  try {
    assert.deepEqual(await listManagementAttemptPage({ page: 1, pageSize: 10, query: "   " }), {
      attempts: [], page: 1, pageSize: 10, total: 0,
    });
    assert.equal(calls.some((call) => call.sql.includes("LOWER(attempts.student_name)")), false);
    assert.deepEqual(calls[0].values, []);
    assert.deepEqual(calls[1].values, [10, 0]);
  } finally {
    restoreDatabaseSeams();
  }
});

test("management attempt detail derives review from the stored legacy snapshot", async () => {
  setPoolForTests({
    execute: async () => [[{
      id: attemptId, code: "c".repeat(32), quiz_id: "quiz-1", quiz_title: "Historical quiz",
      student_name: "<@123456789012345>", score: 1, total: 1, percentage: 100,
      submitted_at: "2026-07-12T12:00:00.000Z", timed_out: 0, submission_reason: "manual",
    }]] as never,
  } as never);
  setReadOnlyQueryForTests((async (sql) => {
    if (sql.includes("FROM attempts WHERE")) {
      return [{
        id: attemptId, student_name: "<@123456789012345>", quiz_id: "quiz-1", score: 1, total: 1, percentage: 100,
        question_snapshot: JSON.stringify([{ id: "question-1", prompt: "Stored prompt", correctOptionId: "right", options: [
          { id: "right", text: "Right answer" }, { id: "wrong", text: "Wrong answer" },
        ] }]), submission_reason: "manual",
      }];
    }
    if (sql.includes("FROM attempt_answers")) {
      return [{ question_id: "question-1", selected_option_id: "right", correct: 1 }];
    }
    return [];
  }) as never);

  try {
    const attempt = await getManagementAttempt(attemptId);

    assert.deepEqual(attempt?.review, {
      available: true,
      revealCorrectness: true,
      questions: [{ prompt: "Stored prompt", selectedText: "Right answer", correctText: "Right answer", state: "correct" }],
    });
  } finally {
    setReadOnlyQueryForTests(queryReadOnly);
    restoreDatabaseSeams();
  }
});

test("management attempt deletion deletes answer rows before its parent attempt", async () => {
  const prior = process.env.EXAMS_MANAGEMENT_WRITES_ENABLED;
  process.env.EXAMS_MANAGEMENT_WRITES_ENABLED = "true";
  const executed: Array<[string, unknown[] | undefined]> = [];
  const connection = {
    async query(sql: string) { executed.push([sql, undefined]); return [[]] as never; },
    async execute(sql: string, values?: unknown[]) {
      executed.push([sql, values]);
      return [{ affectedRows: 1 }] as never;
    },
    async commit() { executed.push(["COMMIT", undefined]); },
    async rollback() { executed.push(["ROLLBACK", undefined]); },
    release() { executed.push(["RELEASE", undefined]); },
  };
  setWritePoolForTests({ getConnection: async () => connection } as never);

  try {
    await deleteManagementAttempt(attemptId);
    assert.deepEqual(executed.map(([sql]) => sql), [
      "START TRANSACTION",
      "DELETE FROM attempt_answers WHERE attempt_id = ?",
      "DELETE FROM attempts WHERE id = ?",
      "COMMIT",
      "RELEASE",
    ]);
  } finally {
    if (prior === undefined) delete process.env.EXAMS_MANAGEMENT_WRITES_ENABLED;
    else process.env.EXAMS_MANAGEMENT_WRITES_ENABLED = prior;
    restoreDatabaseSeams();
  }
});

test("management attempt deletion rolls back when the parent attempt is missing", async () => {
  const prior = process.env.EXAMS_MANAGEMENT_WRITES_ENABLED;
  process.env.EXAMS_MANAGEMENT_WRITES_ENABLED = "true";
  const executed: string[] = [];
  const connection = {
    async query(sql: string) { executed.push(sql); return [[]] as never; },
    async execute(sql: string) {
      executed.push(sql);
      return [sql.startsWith("DELETE FROM attempts") ? { affectedRows: 0 } : { affectedRows: 1 }] as never;
    },
    async commit() { executed.push("COMMIT"); },
    async rollback() { executed.push("ROLLBACK"); },
    release() { executed.push("RELEASE"); },
  };
  setWritePoolForTests({ getConnection: async () => connection } as never);

  try {
    await assert.rejects(() => deleteManagementAttempt(attemptId), /Attempt not found/);
    assert.deepEqual(executed, [
      "START TRANSACTION",
      "DELETE FROM attempt_answers WHERE attempt_id = ?",
      "DELETE FROM attempts WHERE id = ?",
      "ROLLBACK",
      "RELEASE",
    ]);
  } finally {
    if (prior === undefined) delete process.env.EXAMS_MANAGEMENT_WRITES_ENABLED;
    else process.env.EXAMS_MANAGEMENT_WRITES_ENABLED = prior;
    restoreDatabaseSeams();
  }
});
