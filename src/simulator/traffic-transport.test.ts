import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {SharedSession} from "./shared-transport";
import {initialExercise} from "./engine";

test("traffic fields follow authoritative snapshots and motion frames without reverting to older snapshots", async () => {
  const originalFetch = globalThis.fetch, originalWindow = globalThis.window;
  globalThis.window = new EventTarget() as unknown as Window & typeof globalThis;
  const id = randomUUID(), state = initialExercise(id);
  let stream: ReadableStreamDefaultController<Uint8Array>;
  const frame = (revision: number, frequency: "tower" | "ground" | null, landing: "full-stop" | "touch-and-go", type = "snapshot") => {
    const exercise = {...state, revision, aircraft: state.aircraft.map(a => ({...a, frequency, landing}))};
    stream.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(type === "snapshot" ? {type, exercise, session: {id}} : {type, state: exercise, session: {id}})}\n\n`));
  };
  globalThis.fetch = async (input, init) => {
    if (!String(input).endsWith("/stream")) return Response.json({});
    return new Response(new ReadableStream<Uint8Array>({start(controller) {
      stream = controller; frame(1, "ground", "touch-and-go");
      init?.signal?.addEventListener("abort", () => controller.close(), {once: true});
    }}));
  };
  const client = new SharedSession("staff", id, "csrf"), stop = client.start();
  const until = async (revision: number) => {
    const deadline = Date.now() + 2000;
    while (client.getSnapshot().exercise.revision !== revision) {assert.ok(Date.now() < deadline); await new Promise(resolve => setTimeout(resolve, 5));}
  };
  try {
    await until(1);
    frame(5, "tower", "full-stop"); await until(5);
    frame(4, "ground", "touch-and-go"); await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(client.getSnapshot().exercise.revision, 5);
    assert.equal(client.getSnapshot().exercise.aircraft[0].frequency, "tower");
    assert.equal(client.getSnapshot().exercise.aircraft[0].landing, "full-stop");
    frame(6, null, "full-stop", "motion"); await until(6);
    assert.equal(client.getSnapshot().exercise.aircraft[0].frequency, null);
    assert.equal(client.getSnapshot().exercise.aircraft[0].landing, "full-stop");
  } finally {stop(); globalThis.fetch = originalFetch; globalThis.window = originalWindow;}
});
