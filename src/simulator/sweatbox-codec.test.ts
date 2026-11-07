import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {deflateRawSync} from "node:zlib";
import {CODEC_DICTIONARY} from "./codec-dictionary";
import {ByteReader, ByteWriter, decodeReplayFrame, decodeReplayFrames, decodeValue, encodeReplayFrame, encodeValue, framesMatch, concatBytes} from "./sweatbox-codec";
import {POINT_MERGE_PRESETS} from "./point-merge-presets";
import {pointMergeScenario} from "./point-merge-scenarios";
import {createScenarioExercise, materializeAircraft} from "./scenarios";
import {engineFor, initialExercise} from "./engine";
import {applyReplayDelta, replayDelta, replayState, type ReplayFrame} from "./replays";
import {exerciseSchema} from "./protocol";
import type {Exercise} from "./model";

test("the codec dictionary is append-only", () => {
  // Stored replays refer to these indexes. Append new strings; never edit or reorder these.
  const pinned = CODEC_DICTIONARY.slice(0, 686).join("\n");
  assert.equal(createHash("sha256").update(pinned).digest("hex"), "ce99d8b2dc2875c58907dc4eb37239244fba95ee07588079c6d8102d9dbc5f0c");
  assert.equal(new Set(CODEC_DICTIONARY).size, CODEC_DICTIONARY.length, "dictionary entries are unique");
});

test("values round-trip with JSON semantics", () => {
  const value = {kind: "command", aircraftId: "a1", n: [0, 1, -1, 127, 128, 2 ** 40, -(2 ** 52), .1, -2.75, 1 / 3, 1e300, Number.NaN, undefined, null, true, false],
    nested: {text: "Clearéd ✈ to land", empty: "", skip: undefined, list: [{a: 1}, {a: 1}], same: "Clearéd ✈ to land"}, accountId: "abc"};
  assert.deepEqual(decodeValue(encodeValue(value)), JSON.parse(JSON.stringify(value)));
  const small = encodeValue({kind: "command", aircraftId: "a1", frequency: "tower"});
  assert.ok(small.length < JSON.stringify({kind: "command", aircraftId: "a1", frequency: "tower"}).length / 2, "dictionary keys take a byte or two");
  const w = new ByteWriter(); for (const n of [0, 1, 127, 128, 16383, 16384, 2 ** 53 - 1]) w.varuint(n);
  const r = new ByteReader(w.finish()); for (const n of [0, 1, 127, 128, 16383, 16384, 2 ** 53 - 1]) assert.equal(r.varuint(), n);
});

test("malformed bytes are rejected", () => {
  assert.throws(() => decodeValue(new Uint8Array([99])));
  assert.throws(() => decodeValue(new Uint8Array([9, 200])));
  assert.throws(() => decodeValue(concatBytes([encodeValue(1), new Uint8Array([0])])));
  assert.throws(() => decodeValue(new Uint8Array([7, 3, 0xff])), "invalid UTF-8");
  assert.throws(() => decodeReplayFrame(new ByteReader(new Uint8Array([0, 1, 3])), initialExercise("x")));
});

function pointMergeRun(seconds: number) {
  const definition = pointMergeScenario(POINT_MERGE_PRESETS.at(2)!.id);
  const {exercise, runtime} = createScenarioExercise(definition, "s", "00000000-0000-4000-8000-000000000000");
  let state: Exercise = {...exercise, running: true, aircraft: definition.aircraft.map((a, i) => {
    const m = materializeAircraft(runtime, a.key);
    return {...m, position: {x: m.position.x + (i % 6) * 6, y: m.position.y + Math.floor(i / 6) * 6}, altitude: m.altitude + i * 1000};
  })};
  const engine = engineFor(state), states = [replayState(state)];
  for (let i = 0; i < seconds; i++) {
    state = engine.advance(state, 1);
    if (i % 6 === 0 && state.aircraft.length) {
      const a = state.aircraft[i % state.aircraft.length];
      state = {...state, messages: [...state.messages, {id: crypto.randomUUID(), aircraftId: a.id, time: state.elapsed * 1000, frequency: "approach", sender: i % 12 ? "pilot" : "controller", text: `${a.callsign}, turn left heading 270, descend and maintain 4000 feet`} as Exercise["messages"][number]].slice(-300)};
    }
    states.push(replayState(state));
  }
  return states;
}

test("replay frames shrink by an order of magnitude and decode within the stated precision", () => {
  const states = pointMergeRun(600);
  const frames: ReplayFrame[] = states.slice(1).map((s, i) => ({sequence: i + 1, at: i + 1, delta: replayDelta(states[i], s), interpolate: true}));
  const identities = new Set<string>();
  const parts = frames.map((frame, i) => encodeReplayFrame(states[i], frame, {anchors: [1315.0000384473424]}, identities));
  const bytes = concatBytes(parts), json = frames.reduce((n, f) => n + Buffer.byteLength(JSON.stringify(f.delta)), 0);
  const compressed = deflateRawSync(bytes).length;
  assert.ok(bytes.length * 15 < json, `binary ${bytes.length} vs JSON ${json}`);
  assert.ok(compressed * 40 < json, `compressed ${compressed} vs JSON ${json}`);
  const decoded = decodeReplayFrames(bytes, states[0]);
  assert.equal(decoded.frames.length, frames.length);
  decoded.frames.forEach((frame, i) => {
    assert.equal(frame.sequence, frames[i].sequence); assert.equal(frame.at, frames[i].at);
    assert.ok(framesMatch(frames[i].delta, frame.delta), `frame ${i} within precision`);
  });
  // The decoded state remains a valid exercise, as a rewind restores it.
  exerciseSchema.parse({...decoded.state, aircraft: decoded.state.aircraft});
  const last = states.at(-1)!;
  for (const a of decoded.state.aircraft) {
    const original = last.aircraft.find(b => b.id === a.id)!;
    assert.ok(Math.abs(a.position.x - original.position.x) <= .0005 + 1e-9 && Math.abs(a.altitude - original.altitude) <= .5 + 1e-9, "no drift");
  }
});

test("exact frames reproduce every value, and exact values survive quantisation", () => {
  const states = pointMergeRun(30);
  let decodedState = states[0];
  states.slice(1).forEach((s, i) => {
    const frame = {sequence: i + 1, at: (i + 1) * .3, delta: replayDelta(states[i], s), interpolate: false};
    const decoded = decodeReplayFrame(new ByteReader(encodeReplayFrame(states[i], frame, {exact: true})), decodedState);
    assert.deepEqual(JSON.parse(JSON.stringify(decoded)), JSON.parse(JSON.stringify(frame)));
    decodedState = applyReplayDelta(decodedState, decoded.delta);
  });
  assert.deepEqual(JSON.parse(JSON.stringify(decodedState)), JSON.parse(JSON.stringify(states.at(-1))));

  const before = states[0], a = before.aircraft[0], elevation = 1315.0000384473424;
  const after = {...before, aircraft: [{...a, altitude: elevation, heading: 359.97, targetHeading: 0.02, speed: 0, position: {x: a.position.x + .01234, y: a.position.y}}, ...before.aircraft.slice(1)]};
  const frame = {sequence: 1, at: 1, delta: replayDelta(before, after), interpolate: true};
  const decoded = decodeReplayFrame(new ByteReader(encodeReplayFrame(before, frame, {anchors: [elevation]})), before).delta.aircraft[0].value!;
  assert.equal(decoded.altitude, elevation, "ground altitude stays exactly at the airport elevation");
  assert.ok(decoded.heading! < 360 && Math.abs(decoded.heading! - 359.97) < .06, "headings never round up to 360");
  assert.ok(decoded.targetHeading! > 0, "headings never round down to 0");
  assert.equal(decoded.speed, 0);
});
