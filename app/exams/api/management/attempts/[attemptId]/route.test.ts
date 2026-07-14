import assert from "node:assert/strict";
import test from "node:test";

import { DELETE, GET } from "./route";
import { setPoolForTests, setWritePoolForTests } from "@/src/lib/db";
import { setReadOnlyQueryForTests } from "@/src/lib/exams-repository";
import { queryReadOnly } from "@/src/lib/db";
import { csrfTokenFor } from "@/src/lib/central-auth";

const originalFetch = globalThis.fetch;
const attemptId = "11111111-2222-4333-8444-555555555555";
const token = "t".repeat(43);

function authorize(roles: string[]) {
  process.env.DISCORD_GUILD_ID = "guild-1";
  process.env.DISCORD_BOT_TOKEN = "bot-token";
  process.env.DISCORD_MENTOR_ROLE_IDS = "mentor-role";
  process.env.DISCORD_ADMIN_ROLE_IDS = "admin-role";
  process.env.DASHBOARD_API_URL = "https://dashboard-api.atcmh.org";
  process.env.EXAMS_AUTH_KEY = "auth-key";
  process.env.EXAMS_CSRF_SECRET = "x".repeat(32);
  process.env.FRONTEND_PUBLIC_ORIGIN = "https://exams.atcmh.org";
  globalThis.fetch = async (input) => String(input).includes("/internal/auth/sessions/introspect")
    ? Response.json({ active: true, accountId: "1", discordId: "123456789012345", expiresAt: "2099-01-01T00:00:00Z", impersonating: false })
    : Response.json({ roles });
}

function request(method: "GET" | "DELETE") {
  return new Request(`https://exams.atcmh.org/exams/api/management/exams/attempts/${attemptId}`, {
    method,
    headers: { cookie: `atcmh_exams_session=${token}`, origin: "https://dashboard.atcmh.org", "X-CSRF-Token": csrfTokenFor(token) },
  });
}

function context(id = attemptId) { return { params: Promise.resolve({ attemptId: id }) }; }

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  setPoolForTests(undefined);
  setWritePoolForTests(undefined);
  setReadOnlyQueryForTests(queryReadOnly);
  delete process.env.DISCORD_GUILD_ID;
  delete process.env.DISCORD_BOT_TOKEN;
  delete process.env.DISCORD_MENTOR_ROLE_IDS;
  delete process.env.DISCORD_ADMIN_ROLE_IDS;
  delete process.env.EXAMS_MANAGEMENT_WRITES_ENABLED;
});

test("attempt detail permits reviewers", async () => {
  authorize(["mentor-role"]);
  setPoolForTests({ execute: async () => [[{
    id: attemptId, code: "a".repeat(32), quiz_id: "quiz-1", quiz_title: "Historical quiz",
    student_name: "Learner", score: 1, total: 1, percentage: 100, submitted_at: null,
    timed_out: 0, submission_reason: "manual",
  }]] as never } as never);
  setReadOnlyQueryForTests((async (sql) => {
    if (sql.includes("FROM attempts WHERE")) return [{
      id: attemptId, student_name: "Learner", quiz_id: "quiz-1", score: 1, total: 1, percentage: 100,
      question_snapshot: JSON.stringify([]), submission_reason: "manual",
    }];
    return [];
  }) as never);

  const response = await GET(request("GET"), context());

  assert.equal(response.status, 200);
  assert.equal((await response.json() as { attempt: { id: string } }).attempt.id, attemptId);
});

test("attempt detail validates its UUID and returns 404 when missing", async () => {
  authorize(["mentor-role"]);
  const invalid = await GET(request("GET"), context("not-a-uuid"));
  assert.equal(invalid.status, 422);

  setPoolForTests({ execute: async () => [[]] as never } as never);
  const missing = await GET(request("GET"), context());
  assert.equal(missing.status, 404);
});

test("attempt deletion is restricted to administrators", async () => {
  authorize(["mentor-role"]);

  const response = await DELETE(request("DELETE"), context());

  assert.equal(response.status, 403);
});

test("attempt deletion honors the write gate before deleting", async () => {
  authorize(["admin-role"]);

  const response = await DELETE(request("DELETE"), context());

  assert.equal(response.status, 503);
});

test("attempt deletion permits administrators and returns no content", async () => {
  authorize(["admin-role"]);
  process.env.EXAMS_MANAGEMENT_WRITES_ENABLED = "true";
  setWritePoolForTests({ getConnection: async () => ({
    query: async () => [[]] as never,
    execute: async () => [{ affectedRows: 1 }] as never,
    commit: async () => undefined,
    rollback: async () => undefined,
    release: () => undefined,
  }) } as never);

  const response = await DELETE(request("DELETE"), context());

  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "https://dashboard.atcmh.org");
});
