import assert from "node:assert/strict";
import test from "node:test";
import {createPocketSpeechOutput, type PocketPlayback} from "./pocket-output";

const settings = {voice: "pocket:alba", rate: 1, volume: 1};
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const frame = Uint8Array.of(0, 0, 0, 4, 0, 64, 0, 192);
const done = Uint8Array.of(0, 0, 0, 0);

test("plays frames before stream completion and completes in order", async () => {
  let stream!: ReadableStreamDefaultController<Uint8Array>, ended = 0, failed = 0;
  const samples: number[][] = [];
  const playback: PocketPlayback = {activate() {}, begin() {}, append(audio) {samples.push([...audio]);}, finish: async () => {}, cancel() {}, dispose() {}};
  const output = createPocketSpeechOutput(async () => new ReadableStream({start(c) {stream = c;}}), playback);
  output.speak("Radio ready", settings, () => ended++, () => failed++);
  await tick(); stream.enqueue(frame); await tick();
  assert.deepEqual(samples, [[0.5, -0.5]]); assert.equal(ended, 0);
  stream.enqueue(done); stream.close(); await tick();
  assert.equal(ended, 1); assert.equal(failed, 0); output.dispose?.();
});

test("truncated audio does not trigger a duplicate fallback after playback has begun", async () => {
  let ended = 0, failed = 0, status = "";
  const playback: PocketPlayback = {activate() {}, begin() {}, append() {}, finish: async () => {}, cancel() {}, dispose() {}};
  const output = createPocketSpeechOutput(async () => new ReadableStream({start(c) {c.enqueue(frame); c.close();}}), playback);
  output.onStatusChanged?.(value => {status = value;});
  output.speak("Radio ready", settings, () => ended++, () => failed++); await tick();
  assert.equal(ended, 1); assert.equal(failed, 0); assert.match(status, /interrupted/); output.dispose?.();
});

test("cancellation suppresses late audio and completion", async () => {
  let resolve!: (stream: ReadableStream<Uint8Array>) => void, ended = 0, played = 0;
  const playback: PocketPlayback = {activate() {}, begin() {}, append() {played++;}, finish: async () => {}, cancel() {}, dispose() {}};
  const output = createPocketSpeechOutput(() => new Promise(r => {resolve = r;}), playback);
  output.speak("Radio ready", settings, () => ended++, () => ended++); output.cancel();
  resolve(new ReadableStream({start(c) {c.enqueue(frame); c.enqueue(done); c.close();}})); await tick();
  assert.equal(played, 0); assert.equal(ended, 0); output.dispose?.();
});
