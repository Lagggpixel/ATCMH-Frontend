import assert from "node:assert/strict";
import test from "node:test";

import { csvTemplate, parseCsvImport, validateImport, writeImport } from "./import-service";

const validQuiz = {
  title: "Tower fundamentals",
  category: "Tower",
  feedbackMode: "after_submission",
  timeLimitSeconds: 900,
  questions: [{
    prompt: "Which runway is active?",
    options: [
      { text: "Runway 09", isCorrect: true },
      { text: "Runway 27", isCorrect: false },
    ],
  }],
};

test("rejects imports with no questions", () => {
  const result = validateImport({ ...validQuiz, questions: [] });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.path === "questions"));
});

test("rejects questions with more than one correct option", () => {
  const result = validateImport({
    ...validQuiz,
    questions: [{
      prompt: "Question",
      options: [{ text: "One", isCorrect: true }, { text: "Two", isCorrect: true }],
    }],
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.path === "questions[0].options"));
});

test("normalizes a valid quiz without assigning database IDs", () => {
  const result = validateImport(validQuiz);
  assert.equal(result.valid, true);
  assert.deepEqual(result.normalizedImport, {
    title: "Tower fundamentals",
    description: "",
    category: "Tower",
    feedbackMode: "after_submission",
    timeLimitSeconds: 900,
    tags: [],
    isPrivate: false,
    randomizeQuestions: false,
    questions: [{
      prompt: "Which runway is active?",
      randomizeOptions: false,
      options: [
        { text: "Runway 09", isCorrect: true },
        { text: "Runway 27", isCorrect: false },
      ],
    }],
  });
});

test("parses CSV with a row-specific error for invalid boolean values", () => {
  const result = parseCsvImport(`${csvTemplate}\nTower fundamentals,Tower,Question,One,not-a-boolean,1,1`);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.path === "row 2.is_correct"));
});

test("parses one-option-per-row CSV into the normalized quiz", () => {
  const result = parseCsvImport([
    csvTemplate,
    "Tower fundamentals,Tower,Which runway is active?,Runway 09,true,1,1",
    "Tower fundamentals,Tower,Which runway is active?,Runway 27,false,1,2",
  ].join("\n"));
  assert.equal(result.valid, true);
  assert.equal(result.normalizedImport?.questions[0].options.length, 2);
});

test("a failed imported option leaves transaction rollback to the caller", async () => {
  const normalized = validateImport(validQuiz).normalizedImport!;
  const statements: string[] = [];
  const connection = {
    async execute(sql: string) {
      statements.push(sql);
      if (sql.includes("INSERT INTO quiz_options")) throw new Error("option insert failed");
      return [];
    },
  };
  await assert.rejects(() => writeImport(connection, {
    normalizedImport: normalized, categoryId: "category-1", tagIds: [], importedByDiscordId: "123456789012345", idempotencyKey: "key",
  }), /option insert failed/);
  assert.equal(statements.some((sql) => sql.includes("exam_import_audit")), false);
});

test("writes the existing quiz_tags join rows for resolved import tags", async () => {
  const normalized = validateImport({ ...validQuiz, tags: ["VFR"] }).normalizedImport!;
  const statements: Array<{ sql: string; values: readonly unknown[] }> = [];
  const connection = { async execute(sql: string, values: readonly unknown[] = []) { statements.push({ sql, values }); return []; } };
  await writeImport(connection, {
    normalizedImport: normalized, categoryId: "category-1", tagIds: ["tag-1"], importedByDiscordId: "123456789012345", idempotencyKey: "key",
  });
  const join = statements.find((statement) => statement.sql.includes("INSERT INTO quiz_tags"));
  assert.ok(join);
  assert.equal(join.values[1], "tag-1");
});

test("records the import time as the quiz creation and update time", async () => {
  const normalized = validateImport(validQuiz).normalizedImport!;
  const statements: Array<{ sql: string; values: readonly unknown[] }> = [];
  const connection = { async execute(sql: string, values: readonly unknown[] = []) { statements.push({ sql, values }); return []; } };

  await writeImport(connection, {
    normalizedImport: normalized, categoryId: "category-1", tagIds: [], importedByDiscordId: "123456789012345", idempotencyKey: "key",
  });

  const quizInsert = statements.find((statement) => statement.sql.includes("INSERT INTO quizzes"));
  assert.ok(quizInsert);
  assert.match(quizInsert.sql, /created_at, updated_at/);
  assert.equal(quizInsert.values[6], quizInsert.values[7]);
  assert.ok(Number.isFinite(Date.parse(String(quizInsert.values[6]))));
});

test("impersonated import audit stores real actor account and target metadata", async () => {
  const normalized = validateImport(validQuiz).normalizedImport!;
  const statements: Array<{ sql: string; values: readonly unknown[] }> = [];
  const connection = { async execute(sql: string, values: readonly unknown[] = []) { statements.push({ sql, values }); return []; } };
  await writeImport(connection, {
    normalizedImport: normalized, categoryId: "category-1", tagIds: [], importedByDiscordId: "999999999999999999", idempotencyKey: "key",
    impersonation: { realActorAccountId: "7", impersonatedAccountId: "42", impersonatedDiscordId: "123456789012345678" },
  });
  const audit = statements.find((statement) => statement.sql.includes("INSERT INTO exam_import_audit"));
  assert.ok(audit);
  const details = JSON.parse(String(audit.values[4]));
  assert.deepEqual(details.impersonation, { realActorAccountId: "7", impersonatedAccountId: "42", impersonatedDiscordId: "123456789012345678" });
  assert.equal(audit.values[2], "999999999999999999");
});
