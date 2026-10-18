import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {SharedSession} from "./shared-transport";
import {initialExercise} from "./engine";
import {quickCommandAction} from "./quick-commands";
import type {Action} from "./model";

test("only local accepted sends learn, once per retry, across closed windows and reconnect snapshots", async () => {
  const originalFetch = globalThis.fetch, originalWindow = globalThis.window;
  globalThis.window = new EventTarget() as unknown as Window & typeof globalThis;
  const id = randomUUID(), exercise = initialExercise(id), aircraft = exercise.aircraft[0];
  exercise.messages.push({id: "old", aircraftId: aircraft.id, frequency: "ground", sender: "controller", text: "stand by", time: 1, instruction: {type: "radio", message: "standby"}});
  let stream: ReadableStreamDefaultController<Uint8Array>, requests = 0, reject = false;
  const ids: string[] = [];
  const frame = () => stream.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({type: "snapshot", exercise, session: {id}})}\n\n`));
  globalThis.fetch = async (input, init) => {
    if (String(input).endsWith("/commands")) {
      ids.push(JSON.parse(String(init?.body)).envelope.id); requests++;
      return reject ? Response.json({error: "Invalid command"}, {status: 400}) : requests === 1 ? Response.json({error: "Retry"}, {status: 503}) : Response.json({revision: 1});
    }
    if (!String(input).endsWith("/stream")) return Response.json({});
    return new Response(new ReadableStream<Uint8Array>({start(controller) {
      stream = controller; frame(); init?.signal?.addEventListener("abort", () => controller.close(), {once: true});
    }}));
  };
  const session = new SharedSession("mentee", id, "csrf"), stop = session.start();
  const until = async (condition: () => boolean) => {const deadline = Date.now() + 3000; while (!condition()) {assert.ok(Date.now() < deadline); await new Promise(resolve => setTimeout(resolve, 5));}};
  try {
    await until(() => session.getSnapshot().connected);
    assert.deepEqual(session.getSnapshot().quickCommands, []);
    const send = (command: Extract<Action, {kind: "command"}>["command"], resendOf?: string) => session.dispatch({kind: "command", aircraftId: aircraft.id, command, frequency: "ground", text: "", resendOf});
    assert.equal(await session.dispatch({kind: "pilot", aircraftId: aircraft.id, text: "pilot"}), true);
    assert.equal(ids[0], ids[1], "HTTP retries reuse the outgoing id");
    assert.equal(session.getSnapshot().quickCommands.length, 0, "pilot messages do not learn");
    requests = 0;
    assert.equal(await send({type: "cross", runway: "24", expedite: true}), true);
    assert.equal(ids.at(-1), ids.at(-2), "eligible command retries also reuse the outgoing id");
    assert.equal(session.getSnapshot().quickCommands[0].count, 0);
    const firstId = ids.at(-1)!;
    assert.equal(await send({type: "cross", runway: "24"}), true);
    assert.equal(session.getSnapshot().quickCommands[0].count, 1);
    assert.equal("expedite" in session.getSnapshot().quickCommands[0].command && session.getSnapshot().quickCommands[0].command.expedite, true);
    frame(); await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(session.getSnapshot().quickCommands[0].count, 1, "snapshots do not relearn log messages");
    assert.equal(await send({type: "cross", runway: "24", expedite: true}, firstId), true);
    assert.equal(session.getSnapshot().quickCommands[0].count, 2, "resends count once");
    const shortcut = session.getSnapshot().quickCommands[0];
    assert.equal(await session.dispatch(quickCommandAction(shortcut, exercise, aircraft, "ground"), shortcut.path), true);
    assert.equal(session.getSnapshot().quickCommands[0].count, 3, "shortcut taps count too");
    reject = true;
    assert.equal(await send({type: "stop"}), false);
    assert.equal(session.getSnapshot().quickCommands.length, 1, "rejected sends do not learn");
    assert.equal(new SharedSession("mentee", id, "csrf").getSnapshot().quickCommands.length, 0, "new clients start empty");
  } finally {stop(); globalThis.fetch = originalFetch; globalThis.window = originalWindow;}
});
