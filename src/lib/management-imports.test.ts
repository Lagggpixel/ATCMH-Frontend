import assert from "node:assert/strict";
import test from "node:test";

import { payloadHash, previewBinding, requireImportIdempotencySecret, validateImport } from "./import-service";
import { commitPreviewedImport, previewImport } from "./management-imports";
import { setPoolForTests, setWritePoolForTests } from "./db";

const quiz = {
  title: "Tower fundamentals", category: "Tower", feedbackMode: "after_submission", timeLimitSeconds: 900,
  questions: [{ prompt: "Which runway?", options: [{ text: "09", isCorrect: true }, { text: "27", isCorrect: false }] }],
};

function configure() {
  process.env.EXAMS_MANAGEMENT_WRITES_ENABLED = "true";
  process.env.IMPORT_IDEMPOTENCY_SECRET = "x".repeat(48);
  setPoolForTests({ execute: async () => [[{ id: "category-1" }]] } as never);
}

test.afterEach(() => {
  setPoolForTests(undefined);
  setWritePoolForTests(undefined);
  delete process.env.EXAMS_MANAGEMENT_WRITES_ENABLED;
  delete process.env.IMPORT_IDEMPOTENCY_SECRET;
});

test("does not provide a development idempotency-secret fallback", () => {
  delete process.env.IMPORT_IDEMPOTENCY_SECRET;
  assert.throws(() => requireImportIdempotencySecret(), /IMPORT_IDEMPOTENCY_SECRET/);
});

test("preview persists a random nonce on the write connection", async () => {
  configure();
  const statements: Array<{ sql: string; values: readonly unknown[] }> = [];
  const connection = {
    async query() { return [[]] as never; }, async execute(sql: string, values: readonly unknown[] = []) { statements.push({ sql, values }); return [[]] as never; },
    async commit() {}, async rollback() {}, release() {},
  };
  setWritePoolForTests({ getConnection: async () => connection } as never);
  const preview = await previewImport(quiz, "123456789012345");
  assert.equal(preview.valid, true);
  assert.match(preview.idempotencyKey!, /^[0-9a-f-]{36}$/);
  const insert = statements.find((statement) => statement.sql.includes("exam_import_previews"));
  assert.ok(insert);
  assert.equal(insert.values[0], preview.idempotencyKey);
  assert.equal(insert.values[2], "123456789012345");
});

test("commit consumes only an unexpired preview bound to the same actor and payload", async () => {
  configure();
  const nonce = "8e1ed5f2-65fd-4783-b12b-36e873c3e5ed";
  const digest = payloadHash(validateImport(quiz).normalizedImport!);
  const statements: string[] = [];
  const connection = {
    async query() { return [[]] as never; },
    async execute(sql: string) {
      statements.push(sql);
      if (sql.includes("FROM exam_import_previews")) return [[{
        payload_hash: digest, imported_by_discord_id: "123456789012345", binding_hash: previewBinding(nonce, digest, "123456789012345"),
        expires_at: new Date(Date.now() + 60_000), consumed_at: null,
      }]] as never;
      return [[]] as never;
    }, async commit() {}, async rollback() {}, release() {},
  };
  setWritePoolForTests({ getConnection: async () => connection } as never);
  const result = await commitPreviewedImport(quiz, nonce, "123456789012345");
  assert.equal(result.valid, true);
  assert.ok(statements.some((sql) => sql.startsWith("UPDATE exam_import_previews")));
  assert.ok(statements.some((sql) => sql.includes("INSERT INTO exam_import_audit")));
});

test("commit rejects an expired preview without consuming it", async () => {
  configure();
  const nonce = "8e1ed5f2-65fd-4783-b12b-36e873c3e5ed";
  const digest = payloadHash(validateImport(quiz).normalizedImport!);
  const statements: string[] = [];
  const connection = {
    async query() { return [[]] as never; },
    async execute(sql: string) {
      statements.push(sql);
      if (sql.includes("FROM exam_import_previews")) return [[{
        payload_hash: digest, imported_by_discord_id: "123456789012345", binding_hash: previewBinding(nonce, digest, "123456789012345"),
        expires_at: new Date(Date.now() - 60_000), consumed_at: null,
      }]] as never;
      return [[]] as never;
    }, async commit() {}, async rollback() {}, release() {},
  };
  setWritePoolForTests({ getConnection: async () => connection } as never);
  const result = await commitPreviewedImport(quiz, nonce, "123456789012345");
  assert.equal(result.valid, false);
  assert.equal(statements.some((sql) => sql.startsWith("UPDATE exam_import_previews")), false);
});

test("commit rejects a consumed preview nonce replay", async () => {
  configure();
  const nonce = "8e1ed5f2-65fd-4783-b12b-36e873c3e5ed";
  const digest = payloadHash(validateImport(quiz).normalizedImport!);
  const statements: string[] = [];
  const connection = {
    async query() { return [[]] as never; },
    async execute(sql: string) {
      statements.push(sql);
      if (sql.includes("FROM exam_import_previews")) return [[{
        payload_hash: digest, imported_by_discord_id: "123456789012345", binding_hash: previewBinding(nonce, digest, "123456789012345"),
        expires_at: new Date(Date.now() + 60_000), consumed_at: new Date(),
      }]] as never;
      return [[]] as never;
    }, async commit() {}, async rollback() {}, release() {},
  };
  setWritePoolForTests({ getConnection: async () => connection } as never);
  const result = await commitPreviewedImport(quiz, nonce, "123456789012345");
  assert.equal(result.valid, false);
  assert.equal(statements.some((sql) => sql.startsWith("UPDATE exam_import_previews")), false);
});

test("commit rejects a preview nonce presented by another Discord actor", async () => {
  configure();
  const nonce = "8e1ed5f2-65fd-4783-b12b-36e873c3e5ed";
  const digest = payloadHash(validateImport(quiz).normalizedImport!);
  const statements: string[] = [];
  const connection = {
    async query() { return [[]] as never; },
    async execute(sql: string) {
      statements.push(sql);
      if (sql.includes("FROM exam_import_previews")) return [[{
        payload_hash: digest, imported_by_discord_id: "original-actor", binding_hash: previewBinding(nonce, digest, "original-actor"),
        expires_at: new Date(Date.now() + 60_000), consumed_at: null,
      }]] as never;
      return [[]] as never;
    }, async commit() {}, async rollback() {}, release() {},
  };
  setWritePoolForTests({ getConnection: async () => connection } as never);
  const result = await commitPreviewedImport(quiz, nonce, "123456789012345");
  assert.equal(result.valid, false);
  assert.equal(statements.some((sql) => sql.startsWith("UPDATE exam_import_previews")), false);
});

test("commit rejects a nonce whose stored payload hash differs from the submitted import", async () => {
  configure();
  const nonce = "8e1ed5f2-65fd-4783-b12b-36e873c3e5ed";
  const forgedDigest = "0".repeat(64);
  const statements: string[] = [];
  const connection = {
    async query() { return [[]] as never; },
    async execute(sql: string) {
      statements.push(sql);
      if (sql.includes("FROM exam_import_previews")) return [[{
        payload_hash: forgedDigest, imported_by_discord_id: "123456789012345", binding_hash: previewBinding(nonce, forgedDigest, "123456789012345"),
        expires_at: new Date(Date.now() + 60_000), consumed_at: null,
      }]] as never;
      return [[]] as never;
    }, async commit() {}, async rollback() {}, release() {},
  };
  setWritePoolForTests({ getConnection: async () => connection } as never);
  const result = await commitPreviewedImport(quiz, nonce, "123456789012345");
  assert.equal(result.valid, false);
  assert.equal(statements.some((sql) => sql.startsWith("UPDATE exam_import_previews")), false);
});
