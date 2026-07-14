import assert from "node:assert/strict";
import test from "node:test";

import { resolveLearnerAccess } from "./learner-access";

const originalFetch = globalThis.fetch;
const discordId = "123456789012345678";

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function configureStaff() {
  process.env.DISCORD_GUILD_ID = "987654321098765432";
  process.env.DISCORD_BOT_TOKEN = "bot-token";
  process.env.DISCORD_ADMIN_USER_IDS = "223456789012345678";
  process.env.DISCORD_ADMIN_ROLE_IDS = "323456789012345678";
  process.env.DISCORD_MENTOR_ROLE_IDS = "423456789012345678, 523456789012345678";
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.DISCORD_GUILD_ID;
  delete process.env.DISCORD_BOT_TOKEN;
  delete process.env.DISCORD_ADMIN_USER_IDS;
  delete process.env.DISCORD_ADMIN_ROLE_IDS;
  delete process.env.DISCORD_MENTOR_ROLE_IDS;
});

test("configured administrator user bypasses the guild lookup", async () => {
  configureStaff();
  process.env.DISCORD_ADMIN_USER_IDS = `  ${discordId}, 223456789012345678 `;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return response({ roles: [] }); };

  assert.deepEqual(await resolveLearnerAccess(discordId), { discordId, canAccessPrivateQuizzes: true });
  assert.equal(calls, 0);
});

for (const [label, role] of [
  ["administrator", "323456789012345678"],
  ["mentor", "423456789012345678"],
  ["moderator", "523456789012345678"],
] as const) {
  test(`${label} role grants access to private quizzes`, async () => {
    configureStaff();
    globalThis.fetch = async (url, init) => {
      assert.equal(String(url), `https://discord.com/api/v10/guilds/987654321098765432/members/${discordId}`);
      assert.equal(new Headers(init?.headers).get("authorization"), "Bot bot-token");
      return response({ roles: [role] });
    };

    assert.deepEqual(await resolveLearnerAccess(discordId), { discordId, canAccessPrivateQuizzes: true });
  });
}

test("nonmember receives ordinary learner access", async () => {
  configureStaff();
  globalThis.fetch = async () => response({ message: "Unknown Member" }, 404);

  assert.deepEqual(await resolveLearnerAccess(discordId), { discordId, canAccessPrivateQuizzes: false });
});

test("malformed roles receive ordinary learner access", async () => {
  configureStaff();
  for (const body of [{}, { roles: null }, { roles: "423456789012345678" }, { roles: [423456789012345678] }]) {
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

test("Discord fetch rejection receives ordinary learner access", async () => {
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
  delete process.env.DISCORD_BOT_TOKEN;
  assert.deepEqual(await resolveLearnerAccess(discordId), { discordId, canAccessPrivateQuizzes: false });
  assert.equal(calls, 0);
});
