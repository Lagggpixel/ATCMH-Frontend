import assert from "node:assert/strict";
import test from "node:test";

import { isReadOnlySql } from "./db";

const databaseEnvKeys = [
  "MYSQL_HOST",
  "MYSQL_PORT",
  "MYSQL_USER",
  "MYSQL_PASSWORD",
  "MYSQL_DATABASE",
] as const;

function withDatabaseEnvironment(values: Partial<Record<(typeof databaseEnvKeys)[number], string>>, run: () => void | Promise<void>) {
  const prior = new Map(databaseEnvKeys.map((key) => [key, process.env[key]]));
  for (const key of databaseEnvKeys) delete process.env[key];
  Object.assign(process.env, values);
  return Promise.resolve(run()).finally(() => {
    for (const key of databaseEnvKeys) {
      const value = prior.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test("builds encoded atcmh_lms MySQL URLs from the configured component variables", async () => {
  const { databaseUrlFromEnvironment } = await import("./db");
  await withDatabaseEnvironment({
    MYSQL_HOST: "db.example.com",
    MYSQL_PORT: "3307",
    MYSQL_USER: "reader@example",
    MYSQL_PASSWORD: "p@ss:/word",
    MYSQL_DATABASE: "atcmh_lms",
  }, () => {
    assert.equal(
      databaseUrlFromEnvironment(),
      "mysql://reader%40example:p%40ss%3A%2Fword@db.example.com:3307/atcmh_lms",
    );
  });
});

test("rejects reader configuration outside the production atcmh_lms database", async () => {
  const { databaseUrlFromEnvironment } = await import("./db");
  await withDatabaseEnvironment({
    MYSQL_HOST: "db.example.com",
    MYSQL_PORT: "3306",
    MYSQL_USER: "reader",
    MYSQL_PASSWORD: "secret",
    MYSQL_DATABASE: "other_database",
  }, () => {
    assert.throws(() => databaseUrlFromEnvironment(), /MYSQL_DATABASE must be atcmh_lms/);
  });
});

test("uses the shared MySQL configuration for management writes", async () => {
  const { managementWriteUrlFromEnvironment } = await import("./db");
  await withDatabaseEnvironment({
    MYSQL_HOST: "db.example.com",
    MYSQL_PORT: "3306",
    MYSQL_USER: "exam-service",
    MYSQL_PASSWORD: "shared-password",
    MYSQL_DATABASE: "atcmh_lms",
  }, () => {
    assert.equal(
      managementWriteUrlFromEnvironment(),
      "mysql://exam-service:shared-password@db.example.com:3306/atcmh_lms",
    );
  });
});

test("allows ordinary read-only statements", () => {
  assert.equal(isReadOnlySql("SELECT id FROM quizzes WHERE id = ?"), true);
  assert.equal(isReadOnlySql("SHOW TABLES"), true);
});

test("write transactions only expose parameterized execute calls", async () => {
  const executed: string[] = [];
  const connection = {
    async execute(sql: string) { executed.push(sql); return [[]] as never; },
    async query(sql: string) { executed.push(sql); return [[]] as never; },
    async commit() { executed.push("COMMIT"); },
    async rollback() { executed.push("ROLLBACK"); },
    release() { executed.push("RELEASE"); },
  };
  // The test seam permits exercising transaction boundaries without a database.
  const { setWritePoolForTests, withWriteTransaction } = await import("./db");
  setWritePoolForTests({ getConnection: async () => connection } as never);
  await withWriteTransaction(async (transaction) => transaction.execute("INSERT INTO attempts (id) VALUES (?)", ["id"]));
  assert.deepEqual(executed, ["START TRANSACTION", "INSERT INTO attempts (id) VALUES (?)", "COMMIT", "RELEASE"]);
});

test("management writes derive their connection from MYSQL variables only", async () => {
  const { managementWriteUrlFromEnvironment } = await import("./db");
  await withDatabaseEnvironment({
    MYSQL_HOST: "db.example.com",
    MYSQL_PORT: "3306",
    MYSQL_USER: "exam-service",
    MYSQL_PASSWORD: "secret",
    MYSQL_DATABASE: "atcmh_lms",
  }, () => {
    assert.equal(
      managementWriteUrlFromEnvironment(),
      "mysql://exam-service:secret@db.example.com:3306/atcmh_lms",
    );
  });
});

test("a failed import transaction rolls back every prior write", async () => {
  const executed: string[] = [];
  const connection = {
    async execute(sql: string) { executed.push(sql); throw new Error("insert failed"); },
    async query(sql: string) { executed.push(sql); return [[]] as never; },
    async commit() { executed.push("COMMIT"); },
    async rollback() { executed.push("ROLLBACK"); },
    release() { executed.push("RELEASE"); },
  };
  const { setWritePoolForTests, withWriteTransaction } = await import("./db");
  setWritePoolForTests({ getConnection: async () => connection } as never);
  await assert.rejects(() => withWriteTransaction(async (transaction) => transaction.execute("INSERT INTO quizzes (id) VALUES (?)", ["id"])), /insert failed/);
  assert.deepEqual(executed, ["START TRANSACTION", "INSERT INTO quizzes (id) VALUES (?)", "ROLLBACK", "RELEASE"]);
});

test("rejects writes and locking reads", () => {
  assert.equal(isReadOnlySql("UPDATE quizzes SET title = 'x'"), false);
  assert.equal(isReadOnlySql("SELECT * FROM quizzes FOR UPDATE"), false);
  assert.equal(isReadOnlySql("SELECT * FROM quizzes LOCK IN SHARE MODE"), false);
});
