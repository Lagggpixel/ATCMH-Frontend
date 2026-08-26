import assert from "node:assert/strict";
import test from "node:test";

import { resolveLearnerAccess } from "./learner-access";

const originalFetch = globalThis.fetch;
const discordId = "123456789012345678";

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function configureStaff() {
  process.env.DASHBOARD_API_URL = "https://dashboard-api.atcmh.org";
  process.env.EXAMS_AUTH_KEY = "auth-key";
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.DASHBOARD_API_URL;
  delete process.env.EXAMS_AUTH_KEY;
});

test("centralized staff decision grants access to private quizzes", async () => {
  configureStaff();
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "https://dashboard-api.atcmh.org/internal/auth/discord/exams-access");
    assert.equal(new Headers(init?.headers).get("x-exams-auth-key"), "auth-key");
    assert.equal(init?.body, JSON.stringify({discordId}));
    return response({ canAccessPrivateQuizzes: true });
  };

  assert.deepEqual(await resolveLearnerAccess(discordId), { discordId, canAccessPrivateQuizzes: true });
});

test("nonmember receives ordinary learner access", async () => {
  configureStaff();
  globalThis.fetch = async () => response({ message: "Unknown Member" }, 404);

  assert.deepEqual(await resolveLearnerAccess(discordId), { discordId, canAccessPrivateQuizzes: false });
});

test("malformed centralized decisions receive ordinary learner access", async () => {
  configureStaff();
  for (const body of [{}, { canAccessPrivateQuizzes: null }, { canAccessPrivateQuizzes: "true" }]) {
    globalThis.fetch = async () => response(body);
    assert.deepEqual(await resolveLearnerAccess(discordId), { discordId, canAccessPrivateQuizzes: false });
  }
});

for (const status of [401, 403, 404, 500, 503]) {
  test(`Discord member lookup ${status} receives ordinary learner access`, async () => {
    configureStaff();
    globalThis.fetch = async () => response({ message: "lookup failed" }, status);

    assert.deepEqual(await resolveLearnerAccess(discordId), { discordId, canAccessPrivateQuizzes: false });
  });
}

test("central authorization rejection receives ordinary learner access", async () => {
  configureStaff();
  globalThis.fetch = async () => { throw new Error("Discord unavailable"); };

  assert.deepEqual(await resolveLearnerAccess(discordId), { discordId, canAccessPrivateQuizzes: false });
});

test("invalid Discord ID and missing lookup configuration receive ordinary learner access", async () => {
  configureStaff();
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return response({ roles: ["423456789012345678"] }); };

  assert.deepEqual(await resolveLearnerAccess("not-a-snowflake"), {
    discordId: "not-a-snowflake",
    canAccessPrivateQuizzes: false,
  });
  delete process.env.EXAMS_AUTH_KEY;
  assert.deepEqual(await resolveLearnerAccess(discordId), { discordId, canAccessPrivateQuizzes: false });
  assert.equal(calls, 0);
});
