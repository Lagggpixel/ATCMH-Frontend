import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {SharedSession} from "./shared-transport";
import {initialExercise} from "./engine";

test("shared client reconnects with its seat, retries a command idempotently and releases on leave", async () => {
  const originalFetch = globalThis.fetch, originalWindow = globalThis.window;
  const events = new EventTarget();
  globalThis.window = events as unknown as Window & typeof globalThis;
  const id = randomUUID(), tokens: string[] = [], commands: string[] = [];
  let connection = 0, leaveCount = 0;
  globalThis.fetch = async (input, init) => {
    const path = String(input), body = init?.body ? JSON.parse(String(init.body)) : {};
    if (path.endsWith("/join")) {tokens.push(body.token); return Response.json({});}
    if (path.endsWith("/leave")) {leaveCount++; return Response.json({});}
    if (path.endsWith("/commands")) {
      commands.push(body.envelope.id);
      return commands.length === 1 ? Response.json({error: "Retry"}, {status: 503}) : Response.json({revision: 1});
    }
    connection++;
    const stream = new ReadableStream<Uint8Array>({start(controller) {
      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({type: "snapshot", exercise: initialExercise(id), session: {id}})}\n\n`));
      if (connection === 1) controller.close();
      else init?.signal?.addEventListener("abort", () => controller.close(), {once: true});
    }});
    return new Response(stream);
  };
  const session = new SharedSession("staff", id, "csrf"), stop = session.start();
  const until = async (condition: () => boolean) => {
    const deadline = Date.now() + 4000;
    while (!condition()) {assert.ok(Date.now() < deadline, "client condition timed out"); await new Promise(resolve => setTimeout(resolve, 10));}
  };
  try {
    await until(() => connection === 2 && session.getSnapshot().connected);
    assert.equal(new Set(tokens).size, 1);
    session.dispatch({kind: "pause"}); await until(() => commands.length === 2);
    assert.equal(commands[0], commands[1]);
    assert.equal(session.getSnapshot().exercise.id, id);
    events.dispatchEvent(new Event("pagehide")); await until(() => leaveCount === 1);
  } finally {stop(); globalThis.fetch = originalFetch; globalThis.window = originalWindow;}
});

test("duplicate page receives a clear fatal error without releasing the active page's seat", async () => {
  const originalFetch = globalThis.fetch, originalWindow = globalThis.window;
  globalThis.window = new EventTarget() as unknown as Window & typeof globalThis;
  let calls = 0;
  globalThis.fetch = async () => {calls++; return Response.json({code: "seat-occupied", error: "The control page is already open."}, {status: 409});};
  const session = new SharedSession("staff", randomUUID(), "csrf"), stop = session.start();
  try {
    await new Promise<void>(resolve => {
      const unsubscribe = session.subscribe(() => {if (session.getSnapshot().fatal) {unsubscribe(); resolve();}});
    });
    assert.equal(session.getSnapshot().code, "seat-occupied");
    assert.equal(session.getSnapshot().owner, false);
    stop(); assert.equal(calls, 1);
  } finally {stop(); globalThis.fetch = originalFetch; globalThis.window = originalWindow;}
});
