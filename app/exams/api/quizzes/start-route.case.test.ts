import assert from "node:assert/strict";
import test, { mock } from "node:test";

if (process.env.ROUTE_CASE_RUN !== "1") {
  test.skip("route case is run by route.test.ts with module mocking enabled", () => {});
} else {
  test("start is a CSRF-protected POST and preserves the attempt cookie", async () => {
    const quizId = "123e4567-e89b-42d3-a456-426614174000";
    mock.module("@/src/lib/browser-session", { exports: { authorizeLearnerMutation: async (_origin: string | null, _cookie: string | null, csrf: string | null) => csrf === "valid" ? { session: {} } : undefined } });
    mock.module("@/src/lib/learner-session", { exports: { getVerifiedLearnerIdentity: async () => ({ discordId: "123456789012345678", displayName: "Learner" }) } });
    mock.module("@/src/lib/learner-access", { exports: { resolveLearnerAccess: async () => ({ discordId: "123456789012345678", canAccessPrivateQuizzes: false }) } });
    mock.module("@/src/lib/exams-repository", { exports: { getQuizForLearner: async () => ({ id: quizId, timeLimitSeconds: 900 }) } });
    mock.module("@/src/lib/attempt-start-contract", { exports: {
      attemptIdForStart: () => "attempt-id", attemptStartCookieName: () => "attempt_start", createAttemptStart: () => ({ token: "token", startedAt: 1 }), readAttemptStart: () => undefined,
    } });
    mock.module("@/src/lib/dashboard-audit-client", { exports: { emitDashboardAuditEvent: async () => true } });
    const { POST } = await import("./[quizId]/start/route");
    const denied = await POST(new Request(`https://exams.atcmh.org/exams/api/quizzes/${quizId}/start`, { method: "POST" }), { params: Promise.resolve({ quizId }) });
    assert.equal(denied.status, 403);
    process.env.EXAMS_LEARNER_SESSION_SECRET = "x".repeat(32);
    const response = await POST(new Request(`https://exams.atcmh.org/exams/api/quizzes/${quizId}/start`, { method: "POST", headers: { "X-CSRF-Token": "valid" } }), { params: Promise.resolve({ quizId }) });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { redirectTo: `/exams/quizzes/${quizId}/attempt` });
    const cookie = response.headers.get("set-cookie") ?? "";
    assert.match(cookie, /^attempt_start=token;/);
    assert.match(cookie, /Path=\/exams/i);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=lax/i);
  });
}
