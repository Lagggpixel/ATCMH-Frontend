import assert from "node:assert/strict";
import test from "node:test";

import { csrfTokenFor } from "./central-auth";
import { authorizeLearnerMutation, cookieValue } from "./browser-session";

const token = "z".repeat(43);
const originalFetch = globalThis.fetch;

test.beforeEach(() => {
  process.env.FRONTEND_PUBLIC_ORIGIN = "https://exams.atcmh.org";
  process.env.DASHBOARD_API_URL = "https://dashboard-api.atcmh.org";
  process.env.EXAMS_AUTH_KEY = "auth-key";
  process.env.EXAMS_CSRF_SECRET = "x".repeat(32);
  globalThis.fetch = async () => Response.json({ active: true, accountId: "1", discordId: "123456789012345678", expiresAt: "2099-01-01T00:00:00Z", impersonating: false });
});
test.afterEach(() => { globalThis.fetch = originalFetch; });

test("cookie parser finds only the host session cookie", () => {
  assert.equal(cookieValue(`other=1; atcmh_exams_session=${token}`), token);
  assert.equal(cookieValue("other=1"), undefined);
});

test("learner mutations require exact Exams origin, per-session CSRF, and active introspection", async () => {
  const cookie = `atcmh_exams_session=${token}`;
  const csrf = csrfTokenFor(token);
  assert.equal((await authorizeLearnerMutation("https://exams.atcmh.org", cookie, csrf))?.session.discordId, "123456789012345678");
  assert.equal(await authorizeLearnerMutation("https://evil.example", cookie, csrf), undefined);
  assert.equal(await authorizeLearnerMutation("https://exams.atcmh.org", cookie, "wrong"), undefined);
  process.env.FRONTEND_PUBLIC_ORIGIN = "https://exams.atcmh.org/";
  assert.ok(await authorizeLearnerMutation("https://exams.atcmh.org", cookie, csrf));
  globalThis.fetch = async () => new Response("revoked", { status: 401 });
  assert.equal(await authorizeLearnerMutation("https://exams.atcmh.org", cookie, csrf), undefined);
});
