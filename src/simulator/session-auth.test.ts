import assert from "node:assert/strict";
import test from "node:test";
import {authorizeSessionRequest} from "./server/session-auth";
import {csrfTokenFor} from "../lib/central-auth";
import {SessionError} from "./sessions";
import {createSessionApi} from "./server/session-api";
import {createTrainingApi} from "./server/training-api";
import type {SessionStore} from "./server/session-service";

test("every simulator seat enforces staff/admin/tester access, central sign-in, origin and CSRF", async () => {
  const names = ["SIMULATOR_ENABLED", "DASHBOARD_API_URL", "EXAMS_AUTH_KEY", "EXAMS_CSRF_SECRET", "FRONTEND_PUBLIC_ORIGIN"] as const;
  const before = Object.fromEntries(names.map(name => [name, process.env[name]])), originalFetch = globalThis.fetch;
  Object.assign(process.env, {SIMULATOR_ENABLED: "true", DASHBOARD_API_URL: "https://api.test", EXAMS_AUTH_KEY: "test-key", EXAMS_CSRF_SECRET: "test-csrf-secret-for-simulator-tests", FRONTEND_PUBLIC_ORIGIN: "https://atcmh.test"});
  const token = "synthetic-session-token-for-tests-only", csrf = csrfTokenFor(token);
  let moderator = true, tester = false, active = true, allowed: boolean | undefined, role = "staff", permissionStatus = 200; let displayName: string | undefined;
  globalThis.fetch = async input => new Response(JSON.stringify(String(input).includes("/admin/me")
    ? {role, canManageAllAssignments: moderator, canAccessSimulator: allowed ?? (moderator || tester)}
    : {active, displayName, accountId: "101", discordId: "650180912486678528", expiresAt: "2099-01-01T00:00:00Z", impersonating: false}), {status: String(input).includes("/admin/me") ? permissionStatus : 200, headers: {"content-type": "application/json"}});
  const request = (method = "GET", origin = "https://atcmh.test", supplied = csrf) => new Request("https://atcmh.test/api/simulator/sessions", {method, headers: {cookie: `__Host-atcmh_session=${token}`, origin, "x-csrf-token": supplied}});
  const status = (expected: number) => (e: unknown) => e instanceof SessionError && e.status === expected;
  try {
    assert.deepEqual(await authorizeSessionRequest(request(), true), {accountId: "101", staff: true});
    await assert.rejects(authorizeSessionRequest(new Request("https://atcmh.test"), false), status(401));
    moderator = false;
    await assert.rejects(authorizeSessionRequest(request(), true), status(403));
    await assert.rejects(authorizeSessionRequest(request(), false), status(403));

    // Real route handlers must reject learner links, codes, commands and streams before storage.
    const api = createSessionApi({} as SessionStore), id = "11111111-1111-4111-8111-111111111111", seat = "22222222-2222-4222-8222-222222222222";
    const codeRequest = new Request(`${request().url}?code=EGPH-1234ABCD`, request());
    assert.equal((await api.sessionCollection(codeRequest)).status, 403);
    for (const operation of ["join", "command", "leave"]) {
      const call = new Request(request("POST"), {body: JSON.stringify({role: "mentee", token: seat})});
      assert.equal((await api.sessionOperation(call, id, operation)).status, 403, operation);
    }
    const headers = new Headers(request().headers);
    headers.set("x-simulator-role", "mentee"); headers.set("x-simulator-seat", seat);
    assert.equal((await api.sessionOperation(new Request(request(), {headers}), id, "stream")).status, 403);
    assert.equal((await createTrainingApi()(request(), "scenarios")).status, 403);

    tester = true;
    assert.deepEqual(await authorizeSessionRequest(request("POST"), true), {accountId: "101", staff: true});
    assert.deepEqual(await authorizeSessionRequest(request(), false), {accountId: "101", staff: false});
    tester = false;
    for (const permittedRole of ["staff", "admin", "super_admin"]) {
      role = permittedRole; allowed = true;
      for (const staff of [true, false]) assert.deepEqual(await authorizeSessionRequest(request(), staff), {accountId: "101", staff});
      allowed = false;
      for (const staff of [true, false]) await assert.rejects(authorizeSessionRequest(request(), staff), status(403));
    }
    permissionStatus = 403; allowed = true;
    await assert.rejects(authorizeSessionRequest(request(), false), status(403));
    permissionStatus = 200; role = "staff"; allowed = undefined;
    tester = false;
    await assert.rejects(authorizeSessionRequest(request(), true), status(403));
    await assert.rejects(authorizeSessionRequest(request(), false), status(403));
    tester = true;
    await assert.rejects(authorizeSessionRequest(request("POST", "https://evil.test"), false), status(403));
    await assert.rejects(authorizeSessionRequest(request("POST", "https://atcmh.test", "wrong"), false), status(403));
    assert.equal((await authorizeSessionRequest(request("POST"), false)).accountId, "101");
    displayName = "IFC Pilot"; assert.equal((await authorizeSessionRequest(request(), false)).displayName, "IFC Pilot");
    active = false; await assert.rejects(authorizeSessionRequest(request(), false), status(401));
    process.env.SIMULATOR_ENABLED = "false"; await assert.rejects(authorizeSessionRequest(request(), false), status(404));
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of names) {if (before[name] === undefined) delete process.env[name]; else process.env[name] = before[name];}
  }
});
