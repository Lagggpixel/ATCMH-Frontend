import assert from "node:assert/strict";
import test from "node:test";

import { csrfTokenFor } from "./central-auth";
import { requireManagementCapability } from "./discord-auth";

const originalFetch = globalThis.fetch;
const token = "t".repeat(43);
const mentorId = "123456789012345678";

function request(method = "GET", authenticated = true, csrf?: string, origin = "https://www.atcmh.org") {
  return new Request("https://www.atcmh.org/exams/api/management/exams/quizzes", {
    method,
    headers: {
      ...(authenticated ? { cookie: `__Host-atcmh_session=${token}` } : {}),
      ...(method !== "GET" ? { origin, "X-CSRF-Token": csrf ?? "" } : {}),
    },
  });
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

function configure() {
  process.env.DASHBOARD_API_URL = "https://dashboard-api.atcmh.org";
  process.env.EXAMS_AUTH_KEY = "auth-key";
  process.env.EXAMS_CSRF_SECRET = "x".repeat(32);
  process.env.FRONTEND_PUBLIC_ORIGIN = "https://www.atcmh.org";
}

function centralSession(discordId = mentorId) {
  return { active: true, accountId: "42", discordId, expiresAt: "2099-01-01T00:00:00Z", impersonating: false };
}

function impersonatedSession() {
  return { active: true, accountId: "42", discordId: mentorId, expiresAt: "2099-01-01T00:00:00Z", impersonating: true,
    realActorAccountId: "7", realActorDiscordId: "999999999999999999" };
}

function authFetch(capabilities: string[], discordId = mentorId, canManageAll = false) {
  return async (input: RequestInfo | URL) => String(input).includes("/internal/auth/sessions/introspect")
    ? json(centralSession(discordId))
    : json({ capabilities, canManageAll });
}

test.beforeEach(configure);
test.afterEach(() => { globalThis.fetch = originalFetch; });

test("management auth requires an opaque central Exams cookie", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return json({}); };
  const result = await requireManagementCapability(request("GET", false), "manage-exams");
  assert.ok(result instanceof Response);
  assert.equal(result.status, 401);
  assert.equal(calls, 0);
});

test("revoked or unavailable central sessions fail closed", async () => {
  globalThis.fetch = async () => new Response("Unauthorized", { status: 401 });
  const result = await requireManagementCapability(request(), "manage-exams");
  assert.ok(result instanceof Response);
  assert.equal(result.status, 401);
});

test("mentor and administrator capabilities are derived from the introspected Discord ID", async () => {
  globalThis.fetch = authFetch(["manage-exams"]);
  const mentor = await requireManagementCapability(request(), "manage-exams");
  assert.ok(!(mentor instanceof Response));
  assert.equal(mentor.discordId, mentorId);
  assert.equal(mentor.canManageAll, false);

  globalThis.fetch = authFetch(["manage-system"], mentorId, true);
  const admin = await requireManagementCapability(request(), "manage-system");
  assert.ok(!(admin instanceof Response));
  assert.equal(admin.canManageAll, true);
});

test("guild lookup failure is controlled and missing capability is forbidden", async () => {
  globalThis.fetch = async (input) => String(input).includes("/internal/auth/sessions/introspect")
    ? json(centralSession()) : new Response("down", { status: 503 });
  const unavailable = await requireManagementCapability(request(), "manage-exams");
  assert.ok(unavailable instanceof Response);
  assert.equal(unavailable.status, 503);

  globalThis.fetch = authFetch([]);
  const forbidden = await requireManagementCapability(request(), "manage-exams");
  assert.ok(forbidden instanceof Response);
  assert.equal(forbidden.status, 403);
});

test("every management mutation requires exact Origin and per-session CSRF", async () => {
  globalThis.fetch = authFetch(["manage-exams"]);
  const missing = await requireManagementCapability(request("POST"), "manage-exams");
  assert.ok(missing instanceof Response);
  assert.equal(missing.status, 403);

  const wrongOrigin = await requireManagementCapability(request("POST", true, csrfTokenFor(token), "https://evil.example"), "manage-exams");
  assert.ok(wrongOrigin instanceof Response);
  assert.equal(wrongOrigin.status, 403);

  const accepted = await requireManagementCapability(request("POST", true, csrfTokenFor(token)), "manage-exams");
  assert.ok(!(accepted instanceof Response));
});

test("superadmin impersonating a non-staff target loses management access", async () => {
  globalThis.fetch = async (input) => String(input).includes("/internal/auth/sessions/introspect")
    ? json(impersonatedSession()) : json({ capabilities: [], canManageAll: false });
  const actor = await requireManagementCapability(request(), "manage-system");
  assert.ok(actor instanceof Response);
  assert.equal(actor.status, 403);
});

test("impersonated target staff retains target capabilities while audit identity remains the real actor", async () => {
  globalThis.fetch = async (input) => String(input).includes("/internal/auth/sessions/introspect")
    ? json(impersonatedSession()) : json({ capabilities: ["manage-exams"], canManageAll: false });
  const actor = await requireManagementCapability(request(), "manage-exams");
  assert.ok(!(actor instanceof Response));
  assert.equal(actor.discordId, "999999999999999999");
  assert.equal(actor.accountId, "7");
  assert.equal(actor.canManageAll, false);
  assert.ok(actor.capabilities.includes("manage-exams"));
  assert.equal(actor.impersonating, true);
  assert.equal(actor.impersonatedAccountId, "42");
  assert.equal(actor.impersonatedDiscordId, mentorId);
});

test("unknown centralized capabilities are ignored", async () => {
  globalThis.fetch = authFetch(["manage-exams", "invented-capability"]);
  const actor = await requireManagementCapability(request(), "manage-exams");
  assert.ok(!(actor instanceof Response));
  assert.deepEqual(actor.capabilities, ["manage-exams"]);
});
