import assert from "node:assert/strict";
import test, { mock } from "node:test";

if (process.env.ROUTE_CASE_RUN !== "1") {
  test.skip("route case is run by route.test.ts with module mocking enabled", () => {});
} else {
  let exchanges = 0;
  let GET: (request: Request) => Promise<Response>;
  test.before(async () => {
    mock.module("@/src/lib/central-auth", { exports: {
      examsSessionCookie: "atcmh_exams_session",
      examsSessionMaxAge: 30 * 24 * 60 * 60,
      exchangeCentralHandoff: async () => { exchanges += 1; return { token: "o".repeat(43), expiresAt: new Date(Date.now() + 40 * 24 * 60 * 60 * 1000).toISOString() }; },
      safeLocalReturnTo: (value: string | null) => value?.startsWith("/") && !value.startsWith("//") ? value : "/",
    } });
    ({ GET } = await import("./route"));
  });

  test("central one-use handoff sets a 30-day-bounded opaque cookie and returns safely", async () => {
    const response = await GET(new Request(`http://exams:3000/exams/api/auth/discord/user/callback?handoff=${"h".repeat(43)}&returnTo=/exams/quizzes`));
    assert.equal(response.headers.get("location"), "https://public.exams.example/exams/quizzes");
    const cookie = response.headers.get("set-cookie") ?? "";
    assert.match(cookie, /^atcmh_exams_session=/);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /Secure/i);
    assert.match(cookie, /SameSite=lax/i);
    assert.match(cookie, /Path=\/exams/i);
    assert.match(cookie, /Max-Age=2592000/i);
  });

  test("safe backend authentication outcomes return to allowlisted Exams states without exchanging a handoff", async () => {
    const before = exchanges;
    for (const code of ["cancelled", "provider_failure", "consent_declined", "invalid_consent", "consent_expired"]) {
      const response = await GET(new Request(`http://exams:3000/exams/api/auth/discord/user/callback?authError=${code}&returnTo=https://evil.example`));
      assert.equal(response.headers.get("location"), `https://public.exams.example/exams?authError=${code}`);
      assert.equal(response.headers.get("set-cookie"), null);
    }
    assert.equal(exchanges, before);
  });

  test("unknown backend auth errors are never reflected and remain invalid handoffs", async () => {
    const response = await GET(new Request("http://exams:3000/exams/api/auth/discord/user/callback?authError=https%3A%2F%2Fevil.example%2Fxss"));
    assert.equal(response.headers.get("location"), "https://public.exams.example/exams?authError=invalid_handoff");
    assert.ok(!response.headers.get("location")?.includes("evil.example"));
  });
}
