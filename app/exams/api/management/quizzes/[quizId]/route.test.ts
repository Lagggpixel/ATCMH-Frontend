import assert from "node:assert/strict";
import test from "node:test";

import { GET, PUT } from "./route";
import { queryReadOnly } from "@/src/lib/db";
import { setReadOnlyQueryForTests } from "@/src/lib/exams-repository";
import { csrfTokenFor } from "@/src/lib/central-auth";

const originalFetch = globalThis.fetch;
const quizId = "c2a07cd2-3e2e-482e-b2ee-9d5c6fec6bc4";
const token = "t".repeat(43);

function authorizeMentor() {
  process.env.DISCORD_GUILD_ID = "guild-1";
  process.env.DISCORD_BOT_TOKEN = "bot-token";
  process.env.DISCORD_MENTOR_ROLE_IDS = "mentor-role";
  process.env.DASHBOARD_API_URL = "https://dashboard-api.atcmh.org";
  process.env.EXAMS_AUTH_KEY = "auth-key";
  process.env.EXAMS_CSRF_SECRET = "x".repeat(32);
  process.env.FRONTEND_PUBLIC_ORIGIN = "https://exams.atcmh.org";
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/internal/auth/sessions/introspect")) return Response.json({ active: true, accountId: "1", discordId: "123456789012345", expiresAt: "2099-01-01T00:00:00Z", impersonating: false });
    return Response.json({ roles: ["mentor-role"] });
  };
}

function request(method: "GET" | "PUT", body?: string) {
  return new Request(`https://exams.atcmh.org/exams/api/management/exams/quizzes/${quizId}`, {
    method,
    headers: { cookie: `atcmh_exams_session=${token}`, origin: "https://dashboard.atcmh.org", "X-CSRF-Token": csrfTokenFor(token), ...(body ? { "Content-Type": "application/json" } : {}) },
    body,
  });
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  setReadOnlyQueryForTests(queryReadOnly);
  delete process.env.DISCORD_GUILD_ID;
  delete process.env.DISCORD_BOT_TOKEN;
  delete process.env.DISCORD_MENTOR_ROLE_IDS;
  delete process.env.EXAMS_MANAGEMENT_WRITES_ENABLED;
});

test("quiz PUT permits an authorised mentor before parsing or writing", async () => {
  authorizeMentor();
  const response = await PUT(request("PUT", "not JSON"), { params: Promise.resolve({ quizId }) });

  assert.equal(response.status, 503);
  assert.notEqual(response.status, 403);
});

test("quiz GET returns the Dashboard DTO without raw correct-option IDs", async () => {
  authorizeMentor();
  setReadOnlyQueryForTests(async (sql) => {
    if (sql.includes("FROM quizzes")) return [{
      id: quizId,
      title: "Tower fundamentals",
      description: "A short quiz",
      category_id: "category-id",
      category_name: "Tower",
      feedback_mode: "after_submission",
      time_limit_seconds: 900,
      randomize_questions: 1,
      is_private: 1,
    }] as never;
    if (sql.includes("FROM quiz_tags")) return [{ id: "tag-id", name: "Fundamentals" }] as never;
    if (sql.includes("FROM quiz_questions")) return [{
      id: "question-id",
      prompt: "Which runway?",
      correct_option_id: "correct-option-id",
      sort_order: 1,
      randomize_options: 0,
    }] as never;
    if (sql.includes("FROM quiz_options")) return [
      { id: "correct-option-id", question_id: "question-id", text: "09", sort_order: 1 },
      { id: "other-option-id", question_id: "question-id", text: "27", sort_order: 2 },
    ] as never;
    return [] as never;
  });

  const response = await GET(request("GET"), { params: Promise.resolve({ quizId }) });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    quiz: {
      id: quizId,
      title: "Tower fundamentals",
      description: "A short quiz",
      category: "Tower",
      feedbackMode: "after_submission",
      timeLimitSeconds: 900,
      tags: ["Fundamentals"],
      isPrivate: true,
      randomizeQuestions: true,
      questions: [{
        prompt: "Which runway?",
        randomizeOptions: false,
        options: [{ text: "09", isCorrect: true }, { text: "27", isCorrect: false }],
      }],
    },
  });
});
