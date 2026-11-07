import test from "node:test";
import assert from "node:assert/strict";
import {deflateRawSync} from "node:zlib";
import {POINT_MERGE_PRESETS} from "./point-merge-presets";
import {pointMergeScenario} from "./point-merge-scenarios";
import {createScenarioExercise, materializeAircraft} from "./scenarios";
import {engineFor} from "./engine";
import {replayDelta, replayState} from "./replays";
import type {Exercise} from "./model";
import {decodeBody, encodeBody, MOTION_KEYS, StreamDecoder, StreamEncoder} from "./stream-codec";
import {decodeReplayBody, encodeReplayBody, inflateRaw, unwrapReplay, wrapReplay} from "./replay-binary";

function session() {
  const definition = pointMergeScenario(POINT_MERGE_PRESETS.at(2)!.id);
  const {exercise, runtime} = createScenarioExercise(definition, "s", "00000000-0000-4000-8000-000000000000");
  const state: Exercise = {...exercise, running: true, aircraft: definition.aircraft.slice(0, 8).map((a, i) => {
    const m = materializeAircraft(runtime, a.key);
    return {...m, position: {x: m.position.x + (i % 4) * 6, y: m.position.y + Math.floor(i / 4) * 6}, altitude: m.altitude + i * 1000};
  })};
  return {state, engine: engineFor(state)};
}
const json = (value: unknown) => Buffer.byteLength(`data: ${JSON.stringify(value)}\n\n`);
const motion = (exercise: Exercise) => Object.fromEntries(MOTION_KEYS.map(key => [key, exercise[key]]));

test("the compact stream reproduces snapshots and motion exactly and sends the radar environment once", () => {
  let {state} = session();
  const {engine} = session();
  const encoder = new StreamEncoder(), decoder = new StreamDecoder();
  const first = encoder.packet({type: "snapshot", exercise: state, positionId: "approach"});
  const [opened] = decoder.push(first);
  assert.equal(opened.type, "snapshot");
  assert.equal(opened.positionId, "approach");
  assert.deepEqual(opened.exercise, state);
  let motionBytes = 0, motionJson = 0, snapshotBytes = 0, snapshotJson = 0;
  for (let i = 1; i <= 60; i++) {
    state = engine.advance(state, 0.2);
    if (i % 20 === 0) {
      state = {...state, revision: state.revision + 1, messages: [...state.messages, {id: crypto.randomUUID(), aircraftId: state.aircraft[0].id, time: state.elapsed * 1000, frequency: "approach", sender: "pilot", text: "with you descending"} as Exercise["messages"][number]]};
      const packet = encoder.packet({type: "snapshot", exercise: state});
      snapshotBytes += packet.length; snapshotJson += json({type: "snapshot", exercise: state});
      const [message] = decoder.push(packet);
      assert.deepEqual(message.exercise, state);
    } else {
      const value = {type: "motion", state: motion(state), session: {viewers: 2}};
      const packet = encoder.packet(value);
      motionBytes += packet.length; motionJson += json(value);
      const [message] = decoder.push(packet);
      assert.deepEqual(message.state, JSON.parse(JSON.stringify(value.state)));
      assert.deepEqual(message.session, {viewers: 2});
    }
  }
  // A later snapshot carries only what changed, never the airport and nearby facilities again.
  assert.ok(first.length > 8 * (snapshotBytes / 3), `first ${first.length}, later ${snapshotBytes / 3}`);
  assert.ok(snapshotBytes * 20 < snapshotJson, `snapshots ${snapshotBytes} vs JSON ${snapshotJson}`);
  assert.ok(motionBytes * 4 < motionJson, `motion ${motionBytes} vs JSON ${motionJson}`);
});

test("stream packets survive arbitrary network splits and are isolated from later in-place edits", () => {
  const {state} = session();
  const encoder = new StreamEncoder(), decoder = new StreamDecoder();
  const live = structuredClone(state);
  const bytes = Buffer.concat([encoder.packet({type: "snapshot", exercise: live}), encoder.packet({type: "presence", session: {viewers: 1}})]);
  live.aircraft[0].altitude += 5000;
  const messages = [];
  for (let i = 0; i < bytes.length; i += 7) messages.push(...decoder.push(new Uint8Array(bytes.subarray(i, i + 7))));
  assert.deepEqual(messages.map(m => m.type), ["snapshot", "presence"]);
  assert.deepEqual(messages[0].exercise, state);
  const next = {...live, revision: live.revision + 1};
  const [changed] = decoder.push(encoder.packet({type: "snapshot", exercise: next}));
  assert.deepEqual(changed.exercise, next, "the in-place edit is sent as a change on the next packet");
  assert.throws(() => new StreamDecoder().push(new Uint8Array([2, 0, 0])), /Invalid|malformed|range|offset/i);
});

test("command and demonstration bodies round-trip and are smaller than JSON", () => {
  const command = {kind: "radar", aircraftId: "4f1d2b8e-6c0a-4b7e-9f3a-1c2d3e4f5a6b", command: {type: "heading", heading: 270, direction: "left"}, revision: 41, positionId: "approach"};
  const encoded = encodeBody(command);
  assert.deepEqual(decodeBody(encoded), command);
  assert.ok(encoded.length * 2 < Buffer.byteLength(JSON.stringify(command)), `${encoded.length} vs ${JSON.stringify(command).length}`);
});

test("a replay download decodes back to the same frames", async () => {
  let {state} = session();
  const {engine} = session();
  const initial = replayState(state), states = [initial];
  for (let i = 0; i < 90; i++) {state = engine.advance(state, 1); states.push(replayState(state));}
  const frames = states.slice(1).map((s, i) => ({sequence: i + 1, at: i + 1, delta: replayDelta(states[i], s), interpolate: true}));
  const detail = {replay: {id: "r", title: "Point merge"} as never, initial, frames, next: null};
  const download = wrapReplay(new Uint8Array(deflateRawSync(encodeReplayBody(detail))));
  const decoded = decodeReplayBody(await inflateRaw(unwrapReplay(download)));
  assert.equal(decoded.frames.length, 90);
  assert.deepEqual(decoded.initial, initial);
  assert.ok(download.length * 8 < Buffer.byteLength(JSON.stringify(detail)), `${download.length} vs ${JSON.stringify(detail).length}`);
  assert.throws(() => unwrapReplay(new Uint8Array([1, 2, 3, 4, 5])), /damaged/);
});

test("the browser switches to compact command bodies only after the server sends the compact stream", async () => {
  const {randomUUID} = await import("node:crypto");
  const {SharedSession} = await import("./shared-transport");
  const {initialExercise} = await import("./engine");
  const {BODY_BINARY_TYPE, STREAM_BINARY_TYPE, STREAM_FORMAT, STREAM_HEADER} = await import("./stream-codec");
  const originalFetch = globalThis.fetch, originalWindow = globalThis.window;
  globalThis.window = new EventTarget() as unknown as Window & typeof globalThis;
  const id = randomUUID(), bodies: {path: string; type: string | null; body: unknown}[] = [];
  let negotiated: string | null = null;
  globalThis.fetch = async (input, init) => {
    const path = String(input), headers = new Headers(init?.headers);
    if (!path.endsWith("/stream")) {
      const type = headers.get("content-type");
      bodies.push({path, type, body: type === BODY_BINARY_TYPE ? decodeBody(init!.body as Uint8Array) : JSON.parse(String(init?.body))});
      return Response.json({revision: 1, positionId: "approach"});
    }
    negotiated = headers.get(STREAM_HEADER);
    const packet = new StreamEncoder().packet({type: "snapshot", exercise: initialExercise(id), session: {id}});
    return new Response(new ReadableStream<Uint8Array>({start(controller) {
      controller.enqueue(packet);
      init?.signal?.addEventListener("abort", () => controller.close(), {once: true});
    }}), {headers: {"content-type": STREAM_BINARY_TYPE}});
  };
  const client = new SharedSession("staff", id, "csrf"), stop = client.start();
  try {
    await new Promise<void>(resolve => {const unsubscribe = client.subscribe(() => {if (client.getSnapshot().connected) {unsubscribe(); resolve();}});});
    assert.equal(negotiated, STREAM_FORMAT);
    assert.equal(client.getSnapshot().exercise.id, id);
    assert.equal(await client.dispatch({kind: "pause"}), true);
    const join = bodies.find(b => b.path.endsWith("/join"))!, command = bodies.find(b => b.path.endsWith("/commands"))!;
    assert.notEqual(join.type, BODY_BINARY_TYPE, "the first request cannot know the server's format");
    assert.equal(command.type, BODY_BINARY_TYPE);
    assert.deepEqual((command.body as {envelope: {action: unknown}}).envelope.action, {kind: "pause"});
  } finally {stop(); globalThis.fetch = originalFetch; globalThis.window = originalWindow;}
});
