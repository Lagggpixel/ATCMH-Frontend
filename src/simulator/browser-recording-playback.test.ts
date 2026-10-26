import assert from "node:assert/strict";
import test, {type TestContext} from "node:test";
import {browserRecordingPlayback} from "./recorded-output";

const settings = {voice: "", rate: 1.5, volume: .7};
const samples = new Float32Array(24000);
const flush = () => new Promise(resolve => setImmediate(resolve));
function harness(t: TestContext) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "Audio");
  const instances: FakeAudio[] = [];
  class FakeAudio {
    src = ""; preload = ""; volume = 1; playbackRate = 1; preservesPitch = false; paused = true;
    onended: (() => void) | null = null; onerror: ((event: Event) => void) | null = null;
    calls: {resolve: () => void; reject: (error: Error) => void}[] = [];
    play() {return new Promise<void>((resolve, reject) => this.calls.push({resolve: () => {this.paused = false; resolve();}, reject}));}
    pause() {this.paused = true;}
    load() {for (const call of this.calls) call.reject(new DOMException("Aborted by load", "AbortError"));}
    removeAttribute() {this.src = "";}
    constructor() {instances.push(this);}
  }
  Object.defineProperty(globalThis, "Audio", {configurable: true, value: FakeAudio});
  const playback = browserRecordingPlayback();
  t.after(() => {playback.dispose(); if (descriptor) Object.defineProperty(globalThis, "Audio", descriptor); else Reflect.deleteProperty(globalThis, "Audio");});
  return {audio: instances[0], playback};
}

test("cached speech waits for gesture activation instead of aborting the pending primer", async t => {
  const h = harness(t); let started = 0;
  h.playback.activate(); const primer = h.audio.src;
  const playing = h.playback.play(samples, 24000, settings, () => started++);
  assert.equal(h.audio.src, primer); assert.equal(h.audio.calls.length, 1);
  h.audio.calls[0].resolve(); await flush();
  assert.notEqual(h.audio.src, primer); assert.equal(h.audio.calls.length, 2); assert.equal(started, 0);
  h.audio.calls[1].resolve(); await flush(); assert.equal(started, 1);
  assert.equal(h.audio.playbackRate, 1.5); assert.equal(h.audio.preservesPitch, true);
  h.audio.onended!(); await playing;
});

test("a suspended transmission resumes from a normal gesture on the same element", async t => {
  const h = harness(t); let started = 0;
  const playing = h.playback.play(samples, 24000, settings, () => started++);
  h.audio.calls[0].resolve(); await flush(); h.audio.paused = true;
  const src = h.audio.src; h.playback.activate(); assert.equal(h.audio.calls.length, 2);
  assert.equal(h.audio.src, src); h.audio.calls[1].resolve(); await flush(); assert.equal(started, 1);
  h.audio.onended!(); await playing;
});

test("cancel settles even if the device never resolves its play promise", async t => {
  const h = harness(t); let started = 0;
  const playing = h.playback.play(samples, 24000, settings, () => started++);
  h.playback.cancel(); await playing; h.audio.calls[0].resolve(); await flush(); assert.equal(started, 0);
});

test("startup and missing-end-event watchdogs release stalled media", async t => {
  t.mock.timers.enable({apis: ["setTimeout"]}); const h = harness(t);
  const blocked = h.playback.play(samples, 24000, settings);
  const rejected = assert.rejects(blocked, /did not start/); t.mock.timers.tick(4000); await rejected;
  const stalled = h.playback.play(samples, 24000, settings); h.audio.calls.at(-1)!.resolve(); await flush();
  const timedOut = assert.rejects(stalled, /stalled/); t.mock.timers.tick(16000); await timedOut;
});

test("a rejected activation can be retried without toggling audio", async t => {
  const h = harness(t); h.playback.activate();
  h.audio.calls[0].reject(new DOMException("Interaction required", "NotAllowedError")); await flush();
  h.playback.activate(); assert.equal(h.audio.calls.length, 2); h.audio.calls[1].resolve(); await flush();
  const playing = h.playback.play(samples, 24000, settings); h.audio.calls[2].resolve(); await flush();
  h.audio.onended!(); await playing;
});

test("autoplay errors retain their reason for gesture recovery instead of triggering generator cooldown", async t => {
  const h = harness(t), reason = new DOMException("Interaction required", "NotAllowedError");
  const playing = h.playback.play(samples, 24000, settings);
  h.audio.calls[0].reject(reason);
  await assert.rejects(playing, error => error === reason);
});
