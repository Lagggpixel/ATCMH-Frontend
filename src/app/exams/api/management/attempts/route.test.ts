import assert from "node:assert/strict";
import test from "node:test";

import { GET } from "./route";
import { setPoolForTests } from "@/src/lib/db";
import { csrfTokenFor } from "@/src/lib/central-auth";

const originalFetch = globalThis.fetch;
const token = "t".repeat(43);

function authorizeReviewer() {
  process.env.DISCORD_GUILD_ID = "guild-1";
  process.env.DISCORD_BOT_TOKEN = "bot-token";
  process.env.DISCORD_MENTOR_ROLE_IDS = "mentor-role";
  process.env.DASHBOARD_API_URL = "https://dashboard-api.atcmh.org";
  process.env.EXAMS_AUTH_KEY = "auth-key";
  process.env.EXAMS_CSRF_SECRET = "x".repeat(32);
  process.env.FRONTEND_PUBLIC_ORIGIN = "https://atcmh.org";
  globalThis.fetch = async (input) => String(input).includes("/internal/auth/sessions/introspect")
    ? Response.json({ active: true, accountId: "1", discordId: "123456789012345", expiresAt: "2099-01-01T00:00:00Z", impersonating: false })
    : Response.json({ roles: ["mentor-role"] });
}

function request(path = "") {
  return new Request(`https://exams.atcmh.org/exams/api/management/exams/attempts${path}`, {
    headers: { cookie: `atcmh_exams_session=${token}`, origin: "https://atcmh.org", "X-CSRF-Token": csrfTokenFor(token) },
  });
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  setPoolForTests(undefined);
  delete process.env.DISCORD_GUILD_ID;
  delete process.env.DISCORD_BOT_TOKEN;
  delete process.env.DISCORD_MENTOR_ROLE_IDS;
});

test("attempt list permits reviewers and returns the paginated management DTO", async () => {
  authorizeReviewer();
  setPoolForTests({
    execute: async (sql: string) => {
      if (sql.includes("COUNT(*) AS total")) return [[{ total: 51 }]] as never;
      return [[{
      id: "attempt-1", code: "A".repeat(32), quiz_id: "quiz-1", quiz_title: "Tower fundamentals",
      student_name: "Learner", score: 8, total: 10, percentage: 80, submitted_at: null,
      timed_out: 0, submission_reason: "manual",
      }]] as never;
    },
  } as never);

  const response = await GET(request("?page=3&pageSize=25&query=learner"));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "https://atcmh.org");
  assert.deepEqual(await response.json(), {
    attempts: [{
      id: "attempt-1", code: "a".repeat(32), quizId: "quiz-1", quizTitle: "Tower fundamentals",
      studentName: "Learner", studentDiscordId: null, score: 8, total: 10, percentage: 80,
      submittedAt: null, status: "submitted", submissionReason: "manual",
    }], page: 3, pageSize: 25, total: 51,
  });
});

test("attempt list rejects invalid pagination as a validation error", async () => {
  authorizeReviewer();

  const response = await GET(request("?page=0"));

  assert.equal(response.status, 422);
  assert.match((await response.json() as { error: string }).error, /page/i);
});
