import assert from "node:assert/strict";
import test from "node:test";
import {DemoHub} from "./server/demo-hub";
import {DemoRecorder, SHADOW_QUIET_MS, shadowKey, type DemoBatch, type DemoState} from "./demonstration";

const state = (selectedId: string | null): Omit<DemoState, "camera"> => ({
  frequency: "approach", selectedId, messageId: selectedId, menuPath: ["Altitude"], dismissedStrips: {},
  quickHidden: false, utility: null, vectorDraft: null, ground: null,
});

test("a quiet trainee recorder drops pointer samples and sends state at most once a second", async () => {
  let now = 0;
  const posted: DemoBatch[] = [];
  const recorder = new DemoRecorder(async batch => {posted.push(batch);}, () => 12, () => now);
  recorder.setQuiet(true);
  recorder.setState(state("a1"));
  recorder.move({kind: "scope", point: {x: 1, y: 1}});
  await recorder.flush();
  assert.equal(posted.length, 1); assert.equal(posted[0].state?.selectedId, "a1"); assert.equal(posted[0].pointer.length, 0, "no pointer while nobody watches");
  now += 200; recorder.setState(state("a2")); await recorder.flush();
  assert.equal(posted.length, 1, "a changed state waits for the quiet interval");
  recorder.event({kind: "click", at: {kind: "scope", point: {x: 2, y: 2}}}); await recorder.flush();
  assert.equal(posted.length, 2); assert.equal(posted[1].state, undefined); assert.equal(posted[1].events.length, 1, "clicks still go out for replays");
  now += SHADOW_QUIET_MS; await recorder.flush();
  assert.equal(posted.at(-1)?.state?.selectedId, "a2");
  // A staff page starts reading: full rate, pointer included.
  recorder.setQuiet(false);
  now += 10; recorder.setState(state("a3")); recorder.move({kind: "scope", point: {x: 3, y: 3}}); await recorder.flush();
  assert.equal(posted.at(-1)?.state?.selectedId, "a3"); assert.equal(posted.at(-1)?.pointer.length, 1);
});

test("the shadow hub keeps positions apart and counts the streams reading each one", () => {
  const hub = new DemoHub(() => 0);
  const approach = shadowKey("s1", "app"), tower = shadowKey("s1", "twr");
  assert.equal(shadowKey("s1", undefined), "s1:main");
  hub.trust(approach, "trainee", "t1", true); hub.trust(tower, "trainee", "t2", true);
  assert.equal(hub.allowed(approach, "trainee", "t1"), true);
  assert.equal(hub.allowed(approach, "trainee", "t2"), false, "a trainee cannot post for another position");
  assert.equal(hub.watchers(approach), 0);
  const stop = hub.subscribe(approach, () => {});
  assert.equal(hub.watchers(approach), 1); assert.equal(hub.watchers(tower), 0);
  hub.publish(approach, {seq: 1, sentAt: 0, elapsed: 0, pointer: [], events: []});
  assert.ok(hub.read(approach, 0)); assert.equal(hub.read(tower, 0), null);
  assert.deepEqual(hub.keys("s1:").sort(), [approach, tower]);
  stop(); assert.equal(hub.watchers(approach), 0);
});

test("trainee and demonstration frames keep their controller state on the compact stream", async () => {
  const {StreamDecoder, StreamEncoder} = await import("./stream-codec");
  const encoder = new StreamEncoder(), decoder = new StreamDecoder();
  const controls = {frequency: "approach", selectedId: "a1", messageId: "a1", menuPath: ["Altitude"], dismissedStrips: {}, quickHidden: false, utility: null, vectorDraft: {aircraftId: "a1", point: {x: 1.5, y: -2}}, ground: null, camera: null};
  const batches = [{seq: 1, sentAt: 1000, elapsed: 1, pointer: [], events: [{kind: "sent", t: 1000, callsign: "EZY24", text: "Descend", path: ["Altitude"]}], state: controls}];
  const shadow = {type: "shadow", positionId: "north", seq: 1, state: controls, batches};
  const demo = {type: "demo", seq: 3, state: controls, batches};
  const messages = decoder.push(new Uint8Array([...encoder.packet(shadow), ...encoder.packet(demo)]));
  assert.deepEqual(messages, [shadow, demo]);
});
