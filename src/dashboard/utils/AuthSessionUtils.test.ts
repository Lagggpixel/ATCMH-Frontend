import test from "node:test";
import assert from "node:assert/strict";
import {
    examsImpersonationHandoffUrl,
    loginPath,
    PRIVACY_POLICY_URL,
    safeDashboardReturnTo,
    TERMS_OF_SERVICE_URL,
} from "./AuthSessionUtils.ts";

test("central login offers a provider without exposing provider credentials", () => {
    const url = new URL(loginPath("https://api.test", "ifc", "/account"));
    assert.equal(url.pathname, "/auth/login");
    assert.deepEqual(Object.fromEntries(url.searchParams), {provider: "ifc", app: "dashboard", returnTo: "/account"});
    assert.equal(url.hash, "");
});

test("return destinations stay on the dashboard", () => {
    assert.equal(safeDashboardReturnTo("/admin/accounts"), "/admin/accounts");
    assert.equal(safeDashboardReturnTo("//evil.test"), "/account");
    assert.equal(safeDashboardReturnTo("https://evil.test"), "/account");
    assert.equal(safeDashboardReturnTo("/auth/callback"), "/account");
});

test("Exams impersonation uses the one-use callback contract", () => {
    assert.equal(examsImpersonationHandoffUrl("https://atcmh.org", "one use/+"), "https://atcmh.org/exams/api/auth/callback?handoff=one+use%2F%2B&returnTo=%2Fexams");
});

test("login disclosure uses the canonical ATCMH legal documents", () => {
    assert.equal(TERMS_OF_SERVICE_URL, "https://atcmh.org/terms");
    assert.equal(PRIVACY_POLICY_URL, "https://atcmh.org/policy");
});
