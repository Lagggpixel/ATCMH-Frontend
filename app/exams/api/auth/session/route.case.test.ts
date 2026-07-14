import assert from "node:assert/strict";
import test, { mock } from "node:test";

if (process.env.SESSION_ROUTE_CASE !== "1") {
  test.skip("session route case is launched by its wrapper", () => {});
} else {
  test("session endpoint exposes CSRF metadata but never the opaque cookie", async () => {
    mock.module("next/headers", { exports: { cookies: async () => ({ get: () => ({ value: "opaque-central-token" }) }) } });
    mock.module("@/src/lib/central-auth", { exports: {
      examsSessionCookie: "atcmh_exams_session",
      introspectCentralSession: async () => ({ accountId: "42", discordId: "123456789012345678", expiresAt: "2099-01-01T00:00:00Z", impersonating: true, realActorAccountId: "7", realActorDiscordId: "999999999999999999" }),
      csrfTokenFor: () => "browser-csrf",
    } });
    const { GET } = await import("./route");
    const response = await GET(new Request("https://exams.atcmh.org/exams/api/auth/session", { headers: { origin: "https://dashboard.atcmh.org" } }));
    assert.deepEqual(await response.json(), { session: { accountId: "42", discordId: "123456789012345678", expiresAt: "2099-01-01T00:00:00Z", csrfToken: "browser-csrf", impersonating: true,
      realActorAccountId: "7", realActorDiscordId: "999999999999999999", impersonatedAccountId: "42", impersonatedDiscordId: "123456789012345678" } });
    assert.equal(response.headers.get("access-control-allow-origin"), "https://dashboard.atcmh.org");
    assert.equal(response.headers.get("access-control-allow-credentials"), "true");
    assert.equal(response.headers.get("set-cookie"), null);
  });
}
