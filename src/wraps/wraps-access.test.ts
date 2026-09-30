import assert from "node:assert/strict";
import test from "node:test";
import {canOpenWraps} from "./wraps-access";

const session = {application: "web", accountId: "123", impersonating: false, expiresAt: "2027-01-01T00:00:00Z"};
const base = {backendOrigin: "https://dashboard-api.atcmh.org", frontendOrigin: "https://www.atcmh.org", now: Date.parse("2026-09-30T00:00:00Z")};
function mockFetch(role = "super_admin", auth: unknown = session): typeof fetch {
    return async input => Response.json(new URL(String(input)).pathname === "/auth/me" ? auth : {id: "456", role});
}

test("wraps requires a live super-admin session and forwards only the session cookie", async () => {
    const calls: {url: string; options?: RequestInit}[] = [];
    const request: typeof fetch = async (input, options) => {
        calls.push({url: String(input), options});
        return mockFetch()(input, options);
    };
    assert.equal(await canOpenWraps("unrelated=private; __Host-atcmh_session=opaque", {...base, fetch: request}), true);
    assert.equal(calls.length, 2);
    for (const call of calls) {
        assert.equal(new Headers(call.options?.headers).get("Cookie"), "__Host-atcmh_session=opaque");
        assert.equal(call.options?.cache, "no-store");
        assert.equal(call.options?.redirect, "error");
    }
});

test("ordinary admins, mentors/staff, members and guests cannot open wraps", async () => {
    for (const role of ["admin", "staff", "mentor", "member", "", "SUPER_ADMIN"]) {
        assert.equal(await canOpenWraps("atcmh_session=opaque", {...base, fetch: mockFetch(role)}), false);
    }
    let called = false;
    assert.equal(await canOpenWraps("", {...base, fetch: async () => {called = true; return Response.json({});}}), false);
    assert.equal(called, false);
});

test("impersonation, expired sessions, malformed responses and auth failures fail closed", async () => {
    for (const auth of [{...session, impersonating: true}, {...session, expiresAt: "2025-01-01"}, {...session, expiresAt: "invalid"}, {...session, application: "exams"}, {}, null]) {
        assert.equal(await canOpenWraps("atcmh_session=opaque", {...base, fetch: mockFetch("super_admin", auth)}), false);
    }
    for (const status of [401, 403, 500]) {
        assert.equal(await canOpenWraps("atcmh_session=opaque", {...base, fetch: async () => new Response(null, {status})}), false);
    }
    assert.equal(await canOpenWraps("atcmh_session=opaque", {...base, fetch: async () => {throw new Error("offline");}}), false);
    assert.equal(await canOpenWraps("atcmh_session=opaque", {...base, backendOrigin: "http://untrusted.example", fetch: mockFetch()}), false);
});
