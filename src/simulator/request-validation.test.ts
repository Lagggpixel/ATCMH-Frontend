import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {createSessionApi} from "./server/session-api";
import {SessionService} from "./server/session-service";
import {MemoryStore} from "./session-test-store";
import {SharedSession} from "./shared-transport";
import {initialExercise} from "./engine";

test("invalid session fields identify the field and preserve the saved exercise", async () => {
  const store = new MemoryStore(), actor = {accountId: "validation", staff: true};
  const service = new SessionService(store), session = await service.create(actor, "Validation");
  const token = randomUUID(), api = createSessionApi(store, async () => actor);
  await service.join(actor, session.id, "staff", token);
  const before = structuredClone(store.records.get(session.id)!.exercise);
  for (const altitude of [-1, 60001, null]) {
    const response = await api.sessionOperation(new Request("https://test.invalid", {method: "POST", body: JSON.stringify({role: "staff", token,
      envelope: {id: randomUUID(), time: 0, action: {kind: "edit", aircraftId: before.aircraft[0].id, patch: {altitude}}}})}), session.id, "commands");
    assert.equal(response.status, 400);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const failure = await response.json();
    assert.equal(failure.code, "invalid-request");
    assert.match(failure.error, /altitude:/);
    assert.doesNotMatch(failure.error, /refresh/i);
    assert.deepEqual(store.records.get(session.id)!.exercise, before);
  }
  const malformed = await api.sessionOperation(new Request("https://test.invalid", {method: "POST", body: "{"}), session.id, "commands");
  assert.equal(malformed.status, 400);
  assert.match((await malformed.json()).error, /valid JSON/);
});

test("invalid aircraft edits stay out of the command queue and a corrected edit can still be sent", async () => {
  const originalFetch = globalThis.fetch, originalWindow = globalThis.window;
  globalThis.window = new EventTarget() as unknown as Window & typeof globalThis;
  const id = randomUUID(), exercise = initialExercise(id), posted: unknown[] = [];
  globalThis.fetch = async (input, init) => {
    if (String(input).endsWith("/commands")) {posted.push(JSON.parse(String(init?.body))); return Response.json({revision: 1});}
    if (!String(input).endsWith("/stream")) return Response.json({});
    return new Response(new ReadableStream<Uint8Array>({start(controller) {
      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({type: "snapshot", exercise, session: {id}})}\n\n`));
      init?.signal?.addEventListener("abort", () => controller.close(), {once: true});
    }}));
  };
  const client = new SharedSession("staff", id, "csrf"), stop = client.start();
  try {
    const deadline = Date.now() + 2000;
    while (!client.getSnapshot().connected) {assert.ok(Date.now() < deadline); await new Promise(resolve => setTimeout(resolve, 5));}
    for (const patch of [{altitude: -1}, {altitude: 60001}, {speedTargets: {final: 135.5}}, {tagAngle: NaN}, {flightPlan: Array.from({length: 201}, () => ({x: 0, y: 0}))}]) {
      assert.equal(await client.dispatch({kind: "edit", aircraftId: exercise.aircraft[0].id, patch}), false);
      assert.match(client.getSnapshot().error!, /Check the request fields:/);
      assert.equal(client.getSnapshot().connected, true);
    }
    assert.equal(posted.length, 0);
    assert.deepEqual(client.getSnapshot().exercise, exercise);
    assert.equal(await client.dispatch({kind: "edit", aircraftId: exercise.aircraft[0].id, patch: {altitude: 3000}}), true);
    assert.equal(posted.length, 1);
    assert.equal(client.getSnapshot().error, null);
  } finally {stop(); globalThis.fetch = originalFetch; globalThis.window = originalWindow;}
});
