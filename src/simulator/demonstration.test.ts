import assert from "node:assert/strict";
import test from "node:test";
import {applyEnvelope, initialExercise} from "./engine";
import {envelopeSchema, exerciseSchema} from "./protocol";
import {applyReplayDelta, replayDelta} from "./replays";
import {replayEvents, replaySnapshots} from "./replay-events";
import {demoBatchSchema, demoStateSchema, demoPointerAt, demoReplayMarks, replayDemoAt, type DemoBatch} from "./demonstration";
import {DemoHub} from "./server/demo-hub";

const batch = (seq: number, extra: Partial<DemoBatch> = {}): DemoBatch => ({seq, sentAt: 10_000, elapsed: 50, pointer: [], events: [], ...extra});

test("demonstrate toggles exercise control and survives schema validation", () => {
  const start = {...initialExercise(), elapsed: 30};
  const on = applyEnvelope(start, {id: "demo-on", time: 1, action: {kind: "demonstrate", enabled: true}});
  assert.equal(on.error, undefined);
  assert.deepEqual(on.state.demonstration, {startedAt: 30});
  assert.equal(exerciseSchema.parse({...on.state, demonstration: {startedAt: 30, by: "Alex"}}).demonstration?.by, "Alex");
  assert.equal(envelopeSchema.parse({id: "x", time: 1, action: {kind: "demonstrate", enabled: false}}).action.kind, "demonstrate");
  const again = applyEnvelope({...on.state, elapsed: 90}, {id: "demo-again", time: 2, action: {kind: "demonstrate", enabled: true}});
  assert.equal(again.state.demonstration?.startedAt, 30, "turning it on twice keeps the original start");
  const off = applyEnvelope(on.state, {id: "demo-off", time: 3, action: {kind: "demonstrate", enabled: false}});
  assert.equal("demonstration" in off.state, false);
});

test("replay deltas remove an ended demonstration and mark its span", () => {
  const before = {...initialExercise(), elapsed: 10, demonstration: {startedAt: 10, by: "Alex"}};
  const after = {...before, elapsed: 20}; delete (after as Partial<typeof after>).demonstration;
  const delta = replayDelta(before, after);
  assert.deepEqual(delta.unset, ["demonstration"]);
  assert.equal("demonstration" in applyReplayDelta(before, delta), false);
  assert.equal(replayDelta(before, before).unset, undefined);
  const start = {...initialExercise(), elapsed: 0};
  const frames = [
    {sequence: 1, at: 5, delta: replayDelta(start, {...start, elapsed: 5, demonstration: {startedAt: 5, by: "Alex"}}), interpolate: true},
    {sequence: 2, at: 20, delta: replayDelta({...start, elapsed: 5, demonstration: {startedAt: 5, by: "Alex"}}, {...start, elapsed: 20}), interpolate: true},
  ];
  const event = replayEvents(replaySnapshots(start, frames), 20).find(e => e.kind === "demonstration");
  assert.ok(event);
  assert.equal(event.at, 5); assert.equal(event.end, 20); assert.equal(event.label, "Alex");
});

test("demonstration batches become replay marks on the replay clock", () => {
  // Batch posted at exercise 50 s; the frame is written at replay 40 s when the exercise reached 52 s.
  const entry = {elapsed: 50, batch: {sentAt: 10_000, elapsed: 50, pointer: [
    {t: 9_000, at: {kind: "scope" as const, point: {x: 0, y: 0}}},
    {t: 9_050, at: {kind: "scope" as const, point: {x: 1, y: 1}}},
    {t: 9_500, at: {kind: "scope" as const, point: {x: 2, y: 2}}, down: true},
    {t: 9_600, at: {kind: "ui" as const, region: "panel", fx: .5, fy: .5}},
  ], events: [
    {t: 9_500, kind: "click" as const, at: {kind: "scope" as const, point: {x: 2, y: 2}}},
    {t: 9_900, kind: "sent" as const, id: "m1", aircraftId: "a1", callsign: "N172SP", text: "N172SP, taxi to runway 24", path: ["Taxi to...", "Runway 24"]},
  ]}};
  const marks = demoReplayMarks([entry], 40, 52);
  // Sample at t=9000 is 1 s before the batch: exercise 49 s, replay 37 s. The 50 ms sample is thinned out.
  assert.deepEqual(marks.map(m => [Number(m.at.toFixed(2)), m.point?.x ?? null, !!m.click, !!m.sent]), [[37, 0, false, false], [37.5, 2, false, false], [37.5, 2, true, false], [37.9, null, false, true]]);
  const at = replayDemoAt(marks, 37.6);
  assert.deepEqual(at.pointer, {point: {x: 2, y: 2}, down: true, click: true});
  assert.equal(at.sent, null);
  assert.equal(replayDemoAt(marks, 40).sent?.callsign, "N172SP");
  assert.equal(replayDemoAt(marks, 40).pointer, null, "the pointer fades 1.5 s after its last sample");
  assert.equal(replayDemoAt(marks, 50).sent, null, "the sent card clears after 7 s");
  const halfway = replayDemoAt([{at: 1, point: {x: 0, y: 0}}, {at: 1.4, point: {x: 4, y: 0}}], 1.2).pointer!;
  assert.ok(Math.abs(halfway.point.x - 2) < 1e-9);
});

test("pointer samples interpolate only between scope positions", () => {
  const samples = [{t: 0, at: {kind: "scope" as const, point: {x: 0, y: 0}}}, {t: 100, at: {kind: "scope" as const, point: {x: 10, y: 0}}}];
  assert.deepEqual(demoPointerAt(samples, 50)?.at, {kind: "scope", point: {x: 5, y: 0}});
  assert.equal(demoPointerAt([], 0), null);
  assert.throws(() => demoBatchSchema.parse({...batch(1), pointer: Array.from({length: 121}, (_, t) => ({t, at: {kind: "scope", point: {x: 0, y: 0}}}))}));
});

test("the demonstration hub only relays for trusted seats while a demonstration is on", () => {
  let now = 0;
  const hub = new DemoHub(() => now);
  hub.trust("s1", "staff", "staff-token", false);
  assert.equal(hub.allowed("s1", "staff", "staff-token"), false, "nothing relays before the demonstration starts");
  hub.trust("s1", "staff", "staff-token", true);
  hub.trust("s1", "mentee", "mentee-token", true);
  assert.equal(hub.allowed("s1", "staff", "staff-token"), true);
  assert.equal(hub.allowed("s1", "staff", "mentee-token"), false, "a seat cannot post as another role");
  let woke = 0; const stop = hub.subscribe("s1", () => woke++);
  const controller = {frequency: "ground" as const, selectedId: null, messageId: null, menuPath: [], dismissedStrips: {}};
  hub.seed("s1", controller);
  assert.deepEqual(hub.readSeed("s1", 0)?.controller, controller);
  hub.publish("s1", batch(99, {pointer: [{t: 1, at: {kind: "scope", point: {x: 1, y: 1}}}]}));
  const read = hub.read("s1", 0)!;
  assert.equal(read.batches.length, 1); assert.equal(read.batches[0].seq, read.seq, "the hub numbers batches itself");
  assert.equal(hub.read("s1", read.seq), null);
  assert.equal(woke, 2);
  assert.equal(hub.drainTrace("s1").length, 1);
  assert.equal(hub.drainTrace("s1").length, 0);
  now += 6_000;
  assert.equal(hub.allowed("s1", "staff", "staff-token"), false, "trust lapses without a live stream");
  hub.trust("s1", "staff", "staff-token", false);
  assert.equal(hub.read("s1", 0), null, "ending the demonstration clears the mirror");
  stop();
});

test("mirrored scroll positions are bounded ratios keyed by region and path", () => {
  const state = {frequency: "ground", selectedId: null, messageId: null, menuPath: [], dismissedStrips: {}, quickHidden: false, utility: null, vectorDraft: null, ground: null, camera: null};
  assert.deepEqual(demoStateSchema.parse({...state, scroll: {"scope-menu:0": .5, "messages:1.2": 1}}).scroll, {"scope-menu:0": .5, "messages:1.2": 1});
  assert.throws(() => demoStateSchema.parse({...state, scroll: {"scope-menu:0": 2}}));
  assert.throws(() => demoStateSchema.parse({...state, scroll: {"<img>": .5}}));
  assert.throws(() => demoStateSchema.parse({...state, scroll: Object.fromEntries(Array.from({length: 25}, (_, i) => [`messages:${i}`, 0]))}));
});
