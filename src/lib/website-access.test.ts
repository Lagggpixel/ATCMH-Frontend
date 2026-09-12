import assert from "node:assert/strict";
import test from "node:test";
import {reportWebsiteAccess, shouldReportWebsiteAccess, websiteAccessPayload, websiteAccessReportedHeaders} from "./website-access";

test("website access keeps full proxy chain, omits query and only includes the session token", () => {
  const request = new Request("https://www.atcmh.org/account?secret=do-not-log", {headers: {cookie: "unrelated=secret; __Host-atcmh_session=session", "x-forwarded-for": "spoofed, 203.0.113.4, 10.0.0.1"}});
  assert.deepEqual(websiteAccessPayload(request), {token: "session", forwardedFor: "spoofed, 203.0.113.4, 10.0.0.1", path: "/account", method: "GET"});
  assert.deepEqual(websiteAccessPayload(new Request("https://www.atcmh.org/", {headers: {cookie: "bad=%ZZ"}})), {path: "/", method: "GET"});
  assert.equal(Object.hasOwn(websiteAccessPayload(new Request("https://www.atcmh.org/", {headers: {"x-forwarded-for": "1".repeat(4097)}})), "forwardedFor"), false);
});

test("pages and APIs are reported while assets, health and OPTIONS are excluded", () => {
  for (const path of ["/", "/dashboard/accounts", "/api/access", "/exams/api/quizzes/1"]) assert.equal(shouldReportWebsiteAccess(new Request(`https://www.atcmh.org${path}`)), true);
  for (const path of ["/_next/static/app.js", "/_next/image", "/api/health", "/assets/logo.svg"]) assert.equal(shouldReportWebsiteAccess(new Request(`https://www.atcmh.org${path}`)), false);
  assert.equal(shouldReportWebsiteAccess(new Request("https://www.atcmh.org/", {method: "OPTIONS"})), false);
});

test("reporter uses internal service credentials without forwarding unrelated data", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Request[] = [];
  globalThis.fetch = async (input, init) => {requests.push(new Request(input, init)); return new Response(null, {status: 204});};
  try {
    const request = new Request("https://www.atcmh.org/account?token=hidden");
    await reportWebsiteAccess(request, {DASHBOARD_API_URL: "https://backend.test", EXAMS_AUTH_KEY: "internal-secret"});
    assert.equal(requests[0].url, "https://backend.test/internal/auth/request-events");
    assert.equal(requests[0].headers.get("X-Exams-Auth-Key"), "internal-secret");
    assert.equal(requests[0].cache, "no-store");
    assert.deepEqual(await requests[0].json(), {path: "/account", method: "GET"});
    await reportWebsiteAccess(request, {});
    assert.equal(requests.length, 1);
  } finally {globalThis.fetch = originalFetch;}
});

test("relay marker is derived and never exposes the internal service credential", () => {
  const headers = websiteAccessReportedHeaders({EXAMS_AUTH_KEY: "internal-secret"});
  assert.match(headers["X-Atcmh-Access-Reported"], /^[a-f0-9]{64}$/);
  assert.equal(Object.hasOwn(headers, "X-Exams-Auth-Key"), false);
  assert.doesNotMatch(JSON.stringify(headers), /internal-secret/);
});

test("reporting failures log no token, service key, forwarding chain or query", async () => {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  const warnings: unknown[][] = [];
  globalThis.fetch = async () => {throw new Error("session-secret 203.0.113.9 internal-secret");};
  console.warn = (...args) => {warnings.push(args);};
  try {
    await reportWebsiteAccess(new Request("https://www.atcmh.org/account?private=query", {headers: {cookie: "__Host-atcmh_session=session-secret", "x-forwarded-for": "203.0.113.9"}}), {DASHBOARD_API_URL: "https://backend.test", EXAMS_AUTH_KEY: "internal-secret"});
    assert.deepEqual(warnings, [["Website access reporting failed"]]);
  } finally {globalThis.fetch = originalFetch; console.warn = originalWarn;}
});
