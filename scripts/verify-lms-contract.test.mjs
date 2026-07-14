import assert from "node:assert/strict";
import test from "node:test";

import {
  REQUIRED_TABLES,
  REQUIRED_COLUMNS,
  EXPECTED_PRIMARY_KEYS,
  buildColumnQuery,
  buildPrimaryKeyQuery,
  buildAttemptCodeColumnQuery,
  buildAttemptCodeUniqueIndexQuery,
  buildRowCountQuery,
  databaseUrlFromEnvironment,
  isStrictlyReadOnlySql,
  verifyLmsContract,
} from "./verify-lms-contract.mjs";

test("contract verifier uses the same encoded MYSQL component configuration as the service", () => {
  const prior = Object.fromEntries(["MYSQL_HOST", "MYSQL_PORT", "MYSQL_USER", "MYSQL_PASSWORD", "MYSQL_DATABASE"].map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    MYSQL_HOST: "db.example.com",
    MYSQL_PORT: "3306",
    MYSQL_USER: "read@user",
    MYSQL_PASSWORD: "pass:word",
    MYSQL_DATABASE: "atcmh_lms",
  });
  try {
    assert.equal(databaseUrlFromEnvironment(), "mysql://read%40user:pass%3Aword@db.example.com:3306/atcmh_lms");
  } finally {
    for (const [key, value] of Object.entries(prior)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("contract verifier has a check for every preserved LMS table", () => {
  assert.deepEqual(REQUIRED_TABLES, [
    "quizzes",
    "quiz_questions",
    "quiz_options",
    "quiz_tags",
    "quiz_unlocks",
    "attempts",
    "attempt_answers",
    "categories",
    "tags",
    "quiz_bank_draws",
  ]);
});

test("contract verifier pins every required column and primary-key shape from the confirmed LMS contract", () => {
  assert.deepEqual(REQUIRED_COLUMNS, {
    quizzes: ["id", "title", "description", "category_id", "feedback_mode", "time_limit_seconds", "randomize_questions", "is_private"],
    quiz_questions: ["id", "quiz_id", "prompt", "correct_option_id", "sort_order", "randomize_options"],
    quiz_options: ["id", "question_id", "text", "sort_order"],
    quiz_tags: ["quiz_id", "tag_id"],
    quiz_unlocks: ["quiz_id", "user_id", "unlocked_by", "unlocked_at", "user_name"],
    attempts: ["id", "code", "quiz_id", "student_name", "score", "total", "percentage", "submitted_at", "timed_out", "submission_reason", "question_snapshot"],
    attempt_answers: ["attempt_id", "question_id", "selected_option_id", "correct"],
    categories: ["id", "name"],
    tags: ["id", "name"],
    quiz_bank_draws: ["quiz_id", "question_bank_id", "question_count", "sort_order"],
  });
  assert.deepEqual(EXPECTED_PRIMARY_KEYS, {
    quizzes: ["id"],
    quiz_questions: ["id"],
    quiz_options: ["id"],
    quiz_tags: ["quiz_id", "tag_id"],
    quiz_unlocks: ["quiz_id", "user_id"],
    attempts: ["id"],
    attempt_answers: ["attempt_id", "question_id"],
    categories: ["id"],
    tags: ["id"],
    quiz_bank_draws: ["quiz_id", "question_bank_id"],
  });
});

test("contract verifier only builds SELECT queries against metadata or fixed tables", () => {
  for (const table of REQUIRED_TABLES) {
    assert.equal(isStrictlyReadOnlySql(buildRowCountQuery(table)), true);
    assert.equal(isStrictlyReadOnlySql(buildColumnQuery(table)), true);
    assert.equal(isStrictlyReadOnlySql(buildPrimaryKeyQuery(table)), true);
  }
  assert.equal(isStrictlyReadOnlySql("SELECT * FROM quizzes FOR UPDATE"), false);
  assert.equal(isStrictlyReadOnlySql("SELECT 1; DELETE FROM quizzes"), false);
  assert.equal(isStrictlyReadOnlySql("SELECT * INTO OUTFILE '/tmp/leak' FROM quizzes"), false);
  assert.equal(isStrictlyReadOnlySql("\n select id\ninto\t dumpfile '/tmp/leak'\nfrom quizzes"), false);
  assert.equal(isStrictlyReadOnlySql("SHOW TABLES"), false);
});

test("contract verifier rejects identifiers outside its fixed table contract", () => {
  assert.throws(() => buildRowCountQuery("quizzes; DROP TABLE quizzes"), /unknown LMS contract table/);
});

test("contract verifier builds read-only metadata checks for the legacy attempt code contract", () => {
  assert.equal(isStrictlyReadOnlySql(buildAttemptCodeColumnQuery()), true);
  assert.equal(isStrictlyReadOnlySql(buildAttemptCodeUniqueIndexQuery()), true);
});

test("contract verifier requires attempts.code to be non-null VARCHAR(32) with a single-column unique index", async () => {
  const connection = {
    async execute(sql, values) {
      if (sql === buildAttemptCodeColumnQuery()) {
        return [[{ data_type: "varchar", character_maximum_length: 32, is_nullable: "NO" }]];
      }
      if (sql === buildAttemptCodeUniqueIndexQuery()) {
        return [[{ index_name: "code", column_name: "code", seq_in_index: 1 }]];
      }
      if (sql.includes("information_schema.columns")) return [[...REQUIRED_COLUMNS[values[1]].map((column_name) => ({ column_name }))]];
      if (sql.includes("information_schema.key_column_usage")) return [[...EXPECTED_PRIMARY_KEYS[values[1]].map((column_name) => ({ column_name }))]];
      return [[{ row_count: 1 }]];
    },
  };
  await verifyLmsContract(connection, { log() {} });

  for (const badColumn of [
    { data_type: "char", character_maximum_length: 32, is_nullable: "NO" },
    { data_type: "varchar", character_maximum_length: 31, is_nullable: "NO" },
    { data_type: "varchar", character_maximum_length: 32, is_nullable: "YES" },
  ]) {
    const badConnection = {
      execute: async (sql, values) => sql === buildAttemptCodeColumnQuery()
        ? [[badColumn]]
        : connection.execute(sql, values),
    };
    await assert.rejects(() => verifyLmsContract(badConnection, { log() {} }), /attempts\.code must be VARCHAR\(32\) NOT NULL/);
  }

  const noUniqueConnection = {
    execute: async (sql, values) => sql === buildAttemptCodeUniqueIndexQuery()
      ? [[]]
      : connection.execute(sql, values),
  };
  await assert.rejects(() => verifyLmsContract(noUniqueConnection, { log() {} }), /single-column UNIQUE index/);
});
