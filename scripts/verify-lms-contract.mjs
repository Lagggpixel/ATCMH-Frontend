#!/usr/bin/env node

/**
 * Read-only rollout preflight for the existing atcmh_lms database.
 *
 * This process deliberately has no migration or repair mode. Run it with a
 * database account granted SELECT only; its SQL guard permits SELECT queries
 * exclusively, including for INFORMATION_SCHEMA metadata.
 */
import mysql from "mysql2/promise";

const DATABASE_NAME = "atcmh_lms";

export const REQUIRED_TABLES = Object.freeze([
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

export const REQUIRED_COLUMNS = Object.freeze({
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

export const EXPECTED_PRIMARY_KEYS = Object.freeze({
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

const NON_EMPTY_TABLES = Object.freeze(["quizzes", "categories"]);
const SELECT_ONLY = /^\s*SELECT\b[\s\S]*$/i;
const PROHIBITED = /;|\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE|REPLACE|CREATE|GRANT|REVOKE|CALL|DO|HANDLER|LOAD|LOCK|UNLOCK|SET|START|COMMIT|ROLLBACK)\b|\bINTO\s+(?:OUTFILE|DUMPFILE)\b/i;

function assertKnownTable(table) {
  if (!REQUIRED_TABLES.includes(table)) {
    throw new Error(`unknown LMS contract table: ${table}`);
  }
}

/** Exported for the test suite and as a defense-in-depth assertion. */
export function isStrictlyReadOnlySql(sql) {
  return SELECT_ONLY.test(sql) && !PROHIBITED.test(sql);
}

export function buildRowCountQuery(table) {
  assertKnownTable(table);
  return `SELECT COUNT(*) AS row_count FROM \`${table}\``;
}

export function buildColumnQuery(table) {
  assertKnownTable(table);
  return "SELECT column_name FROM information_schema.columns WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position";
}

export function buildPrimaryKeyQuery(table) {
  assertKnownTable(table);
  return "SELECT column_name FROM information_schema.key_column_usage WHERE table_schema = ? AND table_name = ? AND constraint_name = 'PRIMARY' ORDER BY ordinal_position";
}

export function buildAttemptCodeColumnQuery() {
  return "SELECT data_type, character_maximum_length, is_nullable FROM information_schema.columns WHERE table_schema = ? AND table_name = 'attempts' AND column_name = 'code'";
}

export function buildAttemptCodeUniqueIndexQuery() {
  return "SELECT index_name, column_name, seq_in_index FROM information_schema.statistics WHERE table_schema = ? AND table_name = 'attempts' AND non_unique = 0 ORDER BY index_name, seq_in_index";
}

function assertSelectOnly(sql) {
  if (!isStrictlyReadOnlySql(sql)) {
    throw new Error("contract verifier refused a non-SELECT statement");
  }
}

function requiredEnvironmentValue(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be configured with a SELECT-only atcmh_lms account`);
  return value;
}

export function databaseUrlFromEnvironment() {
  const host = requiredEnvironmentValue("MYSQL_HOST");
  const port = requiredEnvironmentValue("MYSQL_PORT");
  const user = requiredEnvironmentValue("MYSQL_USER");
  const password = requiredEnvironmentValue("MYSQL_PASSWORD");
  const database = requiredEnvironmentValue("MYSQL_DATABASE");
  if (database !== DATABASE_NAME) {
    throw new Error("MYSQL_DATABASE must be atcmh_lms");
  }
  const numericPort = Number(port);
  if (!Number.isInteger(numericPort) || numericPort < 1 || numericPort > 65_535) {
    throw new Error("MYSQL_PORT must be a valid TCP port");
  }
  const url = new URL("mysql://localhost");
  url.username = user;
  url.password = password;
  url.hostname = host;
  url.port = String(numericPort);
  url.pathname = `/${database}`;
  return url.toString();
}

async function select(connection, sql, values = []) {
  assertSelectOnly(sql);
  const [rows] = await connection.execute(sql, values);
  return rows;
}

function columnsMissing(table, actualColumns) {
  const found = new Set(actualColumns.map((row) => row.column_name));
  return REQUIRED_COLUMNS[table].filter((column) => !found.has(column));
}

function primaryKeyMismatch(table, actualPrimaryKey) {
  const actual = actualPrimaryKey.map((row) => row.column_name);
  const expected = EXPECTED_PRIMARY_KEYS[table];
  return actual.length !== expected.length || actual.some((column, index) => column !== expected[index]);
}

export async function verifyLmsContract(connection, report = console) {
  const failures = [];
  for (const table of REQUIRED_TABLES) {
    const [columns, primaryKey, countRows] = await Promise.all([
      select(connection, buildColumnQuery(table), [DATABASE_NAME, table]),
      select(connection, buildPrimaryKeyQuery(table), [DATABASE_NAME, table]),
      select(connection, buildRowCountQuery(table)),
    ]);

    const missing = columnsMissing(table, columns);
    if (missing.length) failures.push(`${table}: missing required columns (${missing.join(", ")})`);
    if (primaryKeyMismatch(table, primaryKey)) {
      failures.push(`${table}: primary key is [${primaryKey.map((row) => row.column_name).join(", ")}], expected [${EXPECTED_PRIMARY_KEYS[table].join(", ")}]`);
    }

    const rowCount = Number(countRows[0]?.row_count);
    if (!Number.isSafeInteger(rowCount) || rowCount < 0) failures.push(`${table}: could not read row count`);
    if (NON_EMPTY_TABLES.includes(table) && rowCount === 0) failures.push(`${table}: expected existing production data but found zero rows`);
    report.log(`${table}: ${Number.isSafeInteger(rowCount) ? rowCount : "unavailable"} rows`);
  }

  const [codeColumns, uniqueIndexRows] = await Promise.all([
    select(connection, buildAttemptCodeColumnQuery(), [DATABASE_NAME]),
    select(connection, buildAttemptCodeUniqueIndexQuery(), [DATABASE_NAME]),
  ]);
  const codeColumn = codeColumns[0];
  if (codeColumns.length !== 1
    || codeColumn?.data_type?.toLowerCase() !== "varchar"
    || Number(codeColumn?.character_maximum_length) !== 32
    || codeColumn?.is_nullable !== "NO") {
    failures.push("attempts.code must be VARCHAR(32) NOT NULL");
  }
  const uniqueIndexes = new Map();
  for (const row of uniqueIndexRows) {
    const columns = uniqueIndexes.get(row.index_name) ?? [];
    columns.push(row.column_name);
    uniqueIndexes.set(row.index_name, columns);
  }
  if (![...uniqueIndexes.values()].some((columns) => columns.length === 1 && columns[0] === "code")) {
    failures.push("attempts.code must have a single-column UNIQUE index");
  }

  if (failures.length) {
    throw new Error(`LMS contract verification failed:\n- ${failures.join("\n- ")}`);
  }
}

async function main() {
  const pool = mysql.createPool({ uri: databaseUrlFromEnvironment(), connectionLimit: 1, enableKeepAlive: true });
  try {
    await verifyLmsContract(pool);
    console.log("LMS contract verification passed. No database writes were issued.");
  } finally {
    await pool.end();
  }
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
