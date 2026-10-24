import assert from "node:assert/strict";
import test from "node:test";
import {authorizeSessionRequest} from "./server/session-auth";
import {csrfTokenFor} from "../lib/central-auth";
import {SessionError} from "./sessions";
import {createSessionApi} from "./server/session-api";
import {createTrainingApi} from "./server/training-api";
import type {SessionStore} from "./server/session-service";

test("both access checks start together and a deadline cancels introspection and permissions", async t => {
  const names = ["SIMULATOR_ENABLED", "DASHBOARD_API_URL", "EXAMS_AUTH_KEY", "EXAMS_CSRF_SECRET", "FRONTEND_PUBLIC_ORIGIN"] as const;
  const before = Object.fromEntries(names.map(name => [name, process.env[name]]));
  Object.assign(process.env, {SIMULATOR_ENABLED: "true", DASHBOARD_API_URL: "https://api.test", EXAMS_AUTH_KEY: "test-key", EXAMS_CSRF_SECRET: "test-csrf-secret-for-simulator-tests", FRONTEND_PUBLIC_ORIGIN: "https://atcmh.test"});
  const deadline = new AbortController(), signals: AbortSignal[] = [];
  t.mock.method(AbortSignal, "timeout", (ms: number) => {assert.equal(ms, 8000); return deadline.signal;});
  t.mock.method(globalThis, "fetch", (_input: unknown, init: RequestInit) => {
    signals.push(init.signal!);
    return new Promise<Response>((_resolve, reject) => init.signal!.addEventListener("abort", () => reject(init.signal!.reason), {once: true}));
  });
  try {
    const pending = authorizeSessionRequest(new Request("https://atcmh.test/api/simulator/sessions", {headers: {cookie: "__Host-atcmh_session=synthetic-session-token-for-tests-only"}}), true);
    assert.equal(signals.length, 2);
    assert.equal(signals[0], signals[1]);
    deadline.abort(new DOMException("signal timed out", "TimeoutError"));
    await assert.rejects(pending, (error: unknown) => error instanceof SessionError && error.status === 503 && error.code === "unavailable");
    assert.ok(signals.every(signal => signal.aborted));
  } finally {
    for (const name of names) {if (before[name] === undefined) delete process.env[name]; else process.env[name] = before[name];}
  }
});

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
  const discordId = "650180912486678528", trainer = (staff: boolean) => ({accountId: "101", staff, discordId, canAssign: true});
  try {
    assert.deepEqual(await authorizeSessionRequest(request(), true), trainer(true));
    await assert.rejects(authorizeSessionRequest(new Request("https://atcmh.test"), false), status(401));
    moderator = false;
    await assert.rejects(authorizeSessionRequest(request(), true), status(403));
    await assert.rejects(authorizeSessionRequest(request(), false), status(403));

    // Without access or an assignment, real route handlers reject links, commands and streams before session storage,
    // and a code finds nothing. Assigned mentees are admitted, but only to their own session's mentee seat.
    const api = createSessionApi({hasAssignment: async () => false, lookup: async () => null, assigned: async () => []} as unknown as SessionStore), id = "11111111-1111-4111-8111-111111111111", seat = "22222222-2222-4222-8222-222222222222";
    const codeRequest = new Request(`${request().url}?code=EGPH-1234ABCD5678`, request());
    assert.equal((await api.sessionCollection(codeRequest)).status, 404);
    assert.equal((await api.sessionCollection(new Request(`${request().url}?mine=1`, request()))).status, 200);
    assert.equal((await api.sessionCollection(request())).status, 403);
    await assert.rejects(authorizeSessionRequest(request(), false, {hasAssignment: async () => false}), status(403));
    assert.deepEqual(await authorizeSessionRequest(request(), false, {hasAssignment: async () => true}), {accountId: "101", staff: false, discordId, simulatorAccess: false});
    await assert.rejects(authorizeSessionRequest(request(), true, {hasAssignment: async () => true}), status(403));
    for (const operation of ["join", "command", "leave"]) {
      const call = new Request(request("POST"), {body: JSON.stringify({role: "mentee", token: seat})});
      assert.equal((await api.sessionOperation(call, id, operation)).status, 403, operation);
    }
    const headers = new Headers(request().headers);
    headers.set("x-simulator-role", "mentee"); headers.set("x-simulator-seat", seat);
    assert.equal((await api.sessionOperation(new Request(request(), {headers}), id, "stream")).status, 403);
    assert.equal((await createTrainingApi()(request(), "scenarios")).status, 403);

    tester = true;
    assert.deepEqual(await authorizeSessionRequest(request("POST"), true), trainer(true));
    assert.deepEqual(await authorizeSessionRequest(request(), false), trainer(false));
    tester = false;
    for (const permittedRole of ["staff", "admin", "super_admin"]) {
      role = permittedRole; allowed = true;
      for (const staff of [true, false]) assert.deepEqual(await authorizeSessionRequest(request(), staff), trainer(staff));
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
