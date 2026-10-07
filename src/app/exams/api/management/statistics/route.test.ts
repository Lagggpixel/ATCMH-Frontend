import assert from "node:assert/strict";
import test from "node:test";
import {GET} from "./route";
import {setPoolForTests} from "@/src/lib/db";

const original = globalThis.fetch;
function authorize(capabilities = ["review-attempts"]) {
    process.env.DASHBOARD_API_URL = "https://dashboard-api.atcmh.org";
    process.env.EXAMS_AUTH_KEY = "auth-key";
    process.env.EXAMS_CSRF_SECRET = "x".repeat(32);
    process.env.FRONTEND_PUBLIC_ORIGIN = "https://www.atcmh.org";
    globalThis.fetch = async input => String(input).includes("/internal/auth/sessions/introspect")
        ? Response.json({active: true, accountId: "1", discordId: "123456789012345", expiresAt: "2099-01-01T00:00:00Z", impersonating: false})
        : Response.json({capabilities, canManageAll: false});
}
const request = (query = "", signedIn = true) => new Request(`https://www.atcmh.org/exams/api/management/statistics${query}`, {
    headers: {origin: "https://www.atcmh.org", ...(signedIn ? {cookie: `__Host-atcmh_session=${"t".repeat(43)}`} : {})},
});
test.afterEach(() => {globalThis.fetch = original; setPoolForTests(undefined);});
test("exam reporting requires an authenticated reviewer before any database read", async () => {
    let reads = 0;
    setPoolForTests({execute: async () => {reads++; return [[]];}} as never);
    authorize(); assert.equal((await GET(request("", false))).status, 401);
    authorize([]); assert.equal((await GET(request())).status, 403);
    assert.equal(reads, 0);
});
test("reviewers receive a private statistics response", async () => {
    authorize(); setPoolForTests({execute: async () => [[]]} as never);
    const response = await GET(request("?range=all"));
    assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal((await response.json()).current.attempts, 0);
});
test("invalid windows fail validation and database failures stay within this section", async () => {
    authorize();
    assert.equal((await GET(request("?from=wrong"))).status, 422);
    setPoolForTests({execute: async () => {throw new Error("private connection detail");}} as never);
    const response = await GET(request());
    assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /private connection/);
});
