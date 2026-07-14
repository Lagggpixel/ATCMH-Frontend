import assert from "node:assert/strict";
import test from "node:test";

import {
  centralLoginUrl,
  csrfTokenFor,
  exchangeCentralHandoff,
  introspectCentralSession,
  logoutCentralSession,
  handoffCallbackPath,
  safeLocalReturnTo,
} from "./central-auth";

const env = {
  DASHBOARD_API_URL: "https://dashboard-api.atcmh.org",
  EXAMS_AUTH_KEY: "auth-secret",
  EXAMS_CSRF_SECRET: "x".repeat(32),
  FRONTEND_PUBLIC_ORIGIN: "https://www.atcmh.org",
};
const opaque = "o".repeat(43);

test("central login URL keeps both providers and an AuthReturnPolicy-safe relative callback", () => {
  for (const provider of ["discord", "ifc"] as const) {
    const url = centralLoginUrl(provider, "/exams/quizzes?view=mine", env);
    assert.equal(url.origin, "https://dashboard-api.atcmh.org");
    assert.equal(url.pathname, "/auth/login");
    assert.equal(url.searchParams.get("provider"), provider);
    assert.equal(url.searchParams.get("app"), "exams");
    const outerReturnTo = url.searchParams.get("returnTo")!;
    assert.ok(outerReturnTo.startsWith("/exams/api/auth/callback?"));
    assert.ok(!outerReturnTo.startsWith("//"));
    const callback = new URL(outerReturnTo, "https://www.atcmh.org");
    assert.equal(callback.origin, "https://www.atcmh.org");
    assert.equal(callback.pathname, "/exams/api/auth/callback");
    assert.equal(callback.searchParams.get("returnTo"), "/exams/quizzes?view=mine");
  }
});

test("return destinations fail closed to local paths", () => {
  assert.equal(safeLocalReturnTo("/exams/quizzes?mine=1"), "/exams/quizzes?mine=1");
  assert.equal(safeLocalReturnTo("https://atcmh.org/exams/quizzes"), "/exams");
  assert.equal(safeLocalReturnTo("https://www.atcmh.org/exams/quizzes"), "/exams");
  assert.equal(safeLocalReturnTo("https://evil.example"), "/exams");
  assert.equal(safeLocalReturnTo("//evil.example"), "/exams");
  assert.equal(safeLocalReturnTo("/ok\\evil"), "/exams");
});

test("legacy root impersonation handoffs are routed only to the local callback", () => {
  const path = handoffCallbackPath("h".repeat(43), "/exams/quizzes");
  assert.equal(path, `/exams/api/auth/callback?handoff=${"h".repeat(43)}&returnTo=%2Fexams%2Fquizzes`);
  assert.equal(handoffCallbackPath("https://evil.example/token"), undefined);
});

test("handoff exchange uses the service key and validates the central response", async () => {
  let captured: Request | undefined;
  const handoff = "h".repeat(43);
  const result = await exchangeCentralHandoff(handoff, env, async (input, init) => {
    captured = new Request(input, init);
    return Response.json({ token: opaque, expiresAt: "2099-08-12T00:00:00Z" });
  });
  assert.deepEqual(result, { token: opaque, expiresAt: "2099-08-12T00:00:00Z" });
  assert.equal(captured?.headers.get("X-Exams-Auth-Key"), "auth-secret");
  assert.deepEqual(await captured?.json(), { handoff });
});

test("handoff and introspection fail closed on malformed or inactive responses", async () => {
  await assert.rejects(() => exchangeCentralHandoff("code", env, async () => Response.json({ token: "" })));
  assert.equal(await introspectCentralSession(opaque, env, async () => Response.json({ active: false })), undefined);
  assert.equal(await introspectCentralSession(opaque, env, async () => new Response("down", { status: 503 })), undefined);
});

test("introspection returns only a valid Discord-keyed active Exams identity", async () => {
  const session = await introspectCentralSession(opaque, env, async () => Response.json({
    active: true,
    accountId: "42",
    discordId: "123456789012345678",
    expiresAt: "2099-08-12T00:00:00Z",
    impersonating: false,
  }));
  assert.equal(session?.discordId, "123456789012345678");
  assert.equal(session?.accountId, "42");
});

test("introspection exposes real actor metadata only for a valid impersonation", async () => {
  const body = { active: true, accountId: "42", discordId: "123456789012345678", expiresAt: "2099-08-12T00:00:00Z" };
  const ordinary = await introspectCentralSession(opaque, env, async () => Response.json({ ...body, impersonating: false, realActorAccountId: "7", realActorDiscordId: "999999999999999999" }));
  assert.equal(ordinary?.realActorAccountId, undefined);
  const impersonated = await introspectCentralSession(opaque, env, async () => Response.json({ ...body, impersonating: true, realActorAccountId: "7", realActorDiscordId: "999999999999999999" }));
  assert.equal(impersonated?.realActorDiscordId, "999999999999999999");
  assert.equal(await introspectCentralSession(opaque, env, async () => Response.json({ ...body, impersonating: true })), undefined);
});

test("CSRF is stable per opaque session and central logout is service authenticated", async () => {
  assert.equal(csrfTokenFor(opaque, env), csrfTokenFor(opaque, env));
  assert.notEqual(csrfTokenFor(opaque, env), csrfTokenFor("other", env));
  let request: Request | undefined;
  assert.equal(await logoutCentralSession(opaque, false, env, async (input, init) => {
    request = new Request(input, init);
    return Response.json({ ok: true });
  }), true);
  assert.equal(request?.url, "https://dashboard-api.atcmh.org/internal/auth/sessions/logout");
  assert.equal(request?.headers.get("X-Exams-Auth-Key"), "auth-secret");
  assert.deepEqual(await request?.json(), { token: opaque });
});
