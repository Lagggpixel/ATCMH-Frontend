import assert from "node:assert/strict";
import test from "node:test";
import {sessionLibrary} from "./session-library";

test("sessions update while scenarios are slow and retain their data when scenarios fail", async () => {
  const received: string[][] = [], errors: string[] = [];
  let rejectScenarios!: (reason: Error) => void;
  const scenarios = new Promise<Response>((_resolve, reject) => {rejectScenarios = reject;});
  const sync = sessionLibrary(sessions => received.push(sessions.map(s => s.id)), error => errors.push(error),
    (async path => String(path).endsWith("sessions") ? Response.json({sessions: [{id: "current"}]}) : scenarios) as typeof fetch, 100000);
  try {
    const pending = sync.refresh();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(received, [["current"]]);
    rejectScenarios(Object.assign(new Error("Scenarios unavailable"), {status: 403}));
    await pending;
    assert.deepEqual(received, [["current"]]);
    assert.deepEqual(errors, ["Scenarios unavailable"]);
  } finally {sync.stop();}
});

test("a transient timeout retries only the failed read with a fresh signal", async () => {
  const signals: AbortSignal[] = [], errors: string[] = [];
  let sessionCalls = 0, scenarioCalls = 0;
  const sync = sessionLibrary(() => {}, error => errors.push(error), (async (path, init) => {
    if (String(path).endsWith("sessions")) {
      signals.push(init!.signal!); sessionCalls++;
      if (sessionCalls === 1) throw new DOMException("signal timed out", "TimeoutError");
      return Response.json({sessions: []});
    }
    scenarioCalls++; return Response.json({scenarios: []});
  }) as typeof fetch, 100000);
  try {
    await sync.refresh();
    assert.equal(sessionCalls, 2); assert.equal(scenarioCalls, 1);
    assert.notEqual(signals[0], signals[1]);
    assert.deepEqual(errors, [""]);
  } finally {sync.stop();}
});

test("a fast scenario response cannot restore a cached session after a mutation", async () => {
  let resolveSessions!: (response: Response) => void, refreshed = false;
  const received: string[][] = [];
  const sync = sessionLibrary(sessions => received.push(sessions.map(s => s.id)), () => {}, (async path => {
    if (!String(path).endsWith("sessions")) return Response.json({scenarios: []});
    if (!refreshed) return Response.json({sessions: [{id: "ended"}]});
    return new Promise<Response>(resolve => {resolveSessions = resolve;});
  }) as typeof fetch, 100000);
  try {
    await sync.refresh(); sync.invalidate(); received.length = 0; refreshed = true;
    const pending = sync.refresh();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(received, []);
    resolveSessions(Response.json({sessions: []})); await pending;
    assert.deepEqual(received, [[]]);
  } finally {sync.stop();}
});

test("persistent timeouts use readable feedback and a later refresh clears the error", async () => {
  const errors: string[] = []; let failing = true, calls = 0;
  const sync = sessionLibrary(() => {}, error => errors.push(error), (async path => {
    calls++;
    if (failing) throw new DOMException("signal timed out", "TimeoutError");
    return Response.json(String(path).endsWith("sessions") ? {sessions: []} : {scenarios: []});
  }) as typeof fetch, 100000);
  try {
    await sync.refresh(); assert.equal(calls, 4);
    assert.deepEqual(errors, ["The server took too long to respond. Retrying automatically…"]);
    failing = false; await sync.refresh();
    assert.equal(errors.at(-1), "");
  } finally {sync.stop();}
});

test("stopping an in-flight refresh cancels both reads without retrying or reporting an error", async () => {
  let calls = 0;
  const errors: string[] = [];
  const sync = sessionLibrary(() => assert.fail("Stopped refresh published data"), error => errors.push(error), (async (_path, init) => {
    calls++;
    return new Promise<Response>((_resolve, reject) => init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), {once: true}));
  }) as typeof fetch);
  const pending = sync.refresh(); sync.stop(); await pending;
  assert.equal(calls, 2); assert.deepEqual(errors, []);
});
