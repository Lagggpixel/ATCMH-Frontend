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


test("tag drops stay immediate through delayed acknowledgements, stale frames and overlapping drags", async () => {
  const originalFetch = globalThis.fetch, originalWindow = globalThis.window;
  globalThis.window = new EventTarget() as unknown as Window & typeof globalThis;
  const id = randomUUID(), initial = initialExercise(id), aircraftId = initial.aircraft[0].id;
  const requests: ((response: Response) => void)[] = [];
  let stream: ReadableStreamDefaultController<Uint8Array>;
  const frame = (revision: number, angle?: number) => stream.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({type: "snapshot", exercise: {...initial, revision, aircraft: initial.aircraft.map(a => a.id === aircraftId ? {...a, tagAngle: angle} : a)}, session: {id}})}\n\n`));
  globalThis.fetch = async (input, init) => {
    const path = String(input);
    if (path.endsWith("/commands")) return new Promise<Response>(resolve => requests.push(resolve));
    if (!path.endsWith("/stream")) return Response.json({});
    return new Response(new ReadableStream<Uint8Array>({start(controller) {
      stream = controller; frame(0);
      init?.signal?.addEventListener("abort", () => controller.close(), {once: true});
    }}));
  };
  const client = new SharedSession("staff", id, "csrf"), stop = client.start();
  const until = async (condition: () => boolean) => {
    const deadline = Date.now() + 2000;
    while (!condition()) {assert.ok(Date.now() < deadline, "tag condition timed out"); await new Promise(resolve => setTimeout(resolve, 5));}
  };
  const angle = () => client.getSnapshot().exercise.aircraft.find(a => a.id === aircraftId)!.tagAngle;
  const drop = (tagAngle: number) => client.dispatch({kind: "edit", aircraftId, patch: {tagAngle}});
  try {
    await until(() => client.getSnapshot().connected);
    const first = drop(100);
    assert.equal(angle(), 100, "drop is visible before the request starts");
    frame(0); await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(angle(), 100, "old frames cannot snap the label back");
    stream.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({type: "motion", state: initial, session: {id}})}\n\n`));
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(angle(), 100, "motion updates also retain pending tag positions");
    await until(() => requests.length === 1);
    requests.shift()!(Response.json({revision: 1})); assert.equal(await first, true);
    assert.equal(angle(), 100, "HTTP acknowledgement still waits for its stream revision");
    frame(1, 100); await until(() => client.getSnapshot().exercise.revision === 1);
    frame(2, 200); await until(() => angle() === 200);

    const older = drop(90), newer = drop(270);
    assert.equal(angle(), 270);
    await until(() => requests.length === 1);
    requests.shift()!(Response.json({error: "Rejected"}, {status: 409})); assert.equal(await older, false);
    assert.equal(angle(), 270, "an earlier rejection cannot roll back the latest drag");
    await until(() => requests.length === 1);
    frame(3, 90); await until(() => client.getSnapshot().exercise.revision === 3);
    assert.equal(angle(), 270);
    // The stream can acknowledge a drop before its HTTP request finishes.
    frame(4, 270); await until(() => client.getSnapshot().exercise.revision === 4);
    requests.shift()!(Response.json({revision: 4})); assert.equal(await newer, true);
    frame(5, 200); await until(() => angle() === 200);

    const rejected = drop(45);
    assert.equal(angle(), 45);
    await until(() => requests.length === 1);
    requests.shift()!(Response.json({error: "Read only"}, {status: 403}));
    assert.equal(await rejected, false); assert.equal(angle(), 200);
    assert.equal(client.getSnapshot().error, "Read only");
  } finally {stop(); globalThis.fetch = originalFetch; globalThis.window = originalWindow;}
});
