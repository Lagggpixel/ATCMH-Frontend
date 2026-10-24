import assert from "node:assert/strict";
import test from "node:test";
import {createSentenceSpeechOutput, browserSentenceSpeechOutput, type SentenceLoader} from "./sentence-output";
import {RadioAudio, type VoiceSettings} from "./radio-audio";
import type {RecordingPlayback} from "./recorded-output";
const samples = () => Float32Array.from({length: 2400}, (_, i) => Math.sin(i / 5) * .3);
const flush = () => new Promise(resolve => setImmediate(resolve));
const settings: VoiceSettings = {voice: "", rate: 1.15, volume: .7};
test("loading the first sentence does not interrupt touch audio activation", async () => {
  let primed = false, cancelled = 0, resolve!: (samples: Float32Array) => void;
  const output = createSentenceSpeechOutput(() => new Promise(done => {resolve = done;}), {
    activate() {primed = true;}, cancel() {cancelled++; primed = false;}, dispose() {},
    async play() {assert.equal(primed, true, "the same primed element reaches playback");},
  });
  output.activate!(); output.speak("First transmission", settings, () => {}, () => assert.fail("Playback failed"));
  assert.equal(cancelled, 0); resolve(samples()); await flush(); output.dispose!();
});
function harness() {
  const loaded: {text: string; settings: VoiceSettings; signal: AbortSignal; priority: string; resolve: (samples: Float32Array) => void; reject: (error: Error) => void}[] = [];
  const played: {samples: Float32Array; settings: VoiceSettings; end: () => void}[] = [];
  const load: SentenceLoader = (text, settings, signal, priority) => new Promise((resolve, reject) => loaded.push({text, settings, signal, priority, resolve, reject}));
  const playback: RecordingPlayback = {activate() {}, cancel() {}, dispose() {}, play: (samples, _rate, settings) => new Promise(end => played.push({samples, settings, end}))};
  return {output: createSentenceSpeechOutput(load, playback), loaded, played};
}
test("full-sentence playback makes one synthesis request and preserves its internal rhythm", async () => {
  assert.equal(browserSentenceSpeechOutput("csrf"), null);
  const h = harness(); let ended = 0;
  const text = "Speedbird one zero four, descend and maintain four thousand feet. Contact Tower.";
  h.output.speak(text, settings, () => ended++, () => assert.fail("Playback failed"));
  assert.equal(h.loaded.length, 1); assert.equal(h.loaded[0].text, text);
  const audio = new Float32Array(24000); audio.set(samples()); audio.set(samples(), 21600);
  h.loaded[0].resolve(audio); await flush();
  assert.deepEqual(h.played[0].samples, audio, "no word joins or internal silence compaction");
  assert.equal(h.played[0].settings.rate, 1.15);
  h.played[0].end(); await flush(); assert.equal(ended, 1); h.output.dispose!();
});
test("queued calls prepare ahead, stay ordered, and use the latest speed and volume", async () => {
  const h = harness(), player = new RadioAudio(), close = player.start(h.output);
  player.say("first"); h.loaded[0].resolve(samples()); await flush();
  player.say("second"); assert.equal(h.loaded[1].priority, "prepare");
  h.loaded[1].resolve(samples()); await flush(); assert.equal(h.played.length, 1);
  player.setSettings({rate: 1.8, volume: .2}); h.played[0].end(); await flush();
  assert.equal(h.loaded.length, 2); assert.equal(h.played.length, 2);
  assert.equal(h.played[1].settings.rate, 1.8); assert.equal(h.played[1].settings.volume, .2); close();
});
test("replaced drafts cancel downloads but cannot cancel the same text after Send", async () => {
  const h = harness();
  h.output.prepareDraft!("old draft", settings); h.output.prepareDraft!("reviewed draft", settings);
  assert.ok(h.loaded[0].signal.aborted);
  h.output.speak("reviewed draft", settings, () => {}, () => assert.fail("Promoted draft failed"));
  h.output.cancelDraft!(); assert.equal(h.loaded[1].signal.aborted, false);
  h.loaded[1].resolve(samples()); await flush(); assert.equal(h.played.length, 1);
  h.loaded[0].resolve(samples()); await flush(); assert.equal(h.played.length, 1); h.output.dispose!();
});
test("stop aborts speech and late results cannot start audio; failures can retry", async () => {
  const h = harness(); let errors = 0;
  h.output.speak("cancelled", settings, () => assert.fail("Cancelled audio ended"), () => errors++);
  h.output.cancel(); assert.ok(h.loaded[0].signal.aborted);
  h.loaded[0].resolve(samples()); await flush(); assert.equal(h.played.length, 0); assert.equal(errors, 0);
  h.output.speak("retry", settings, () => {}, () => errors++); h.loaded[1].reject(new Error("Temporary failure")); await flush(); assert.equal(errors, 1);
  h.output.speak("retry", settings, () => {}, () => assert.fail("Retry failed")); h.loaded[2].resolve(samples()); await flush(); assert.equal(h.played.length, 1); h.output.dispose!();
});
test("voice and radio effect have separate audio caches, while rate changes reuse speech", async () => {
  const h = harness();
  h.output.prepare!("message", settings); h.loaded[0].resolve(samples()); await flush();
  h.output.speak("message", {...settings, rate: 2}, () => {}, () => {}); await flush(); assert.equal(h.loaded.length, 1);
  h.output.speak("message", {...settings, radioFilter: true}, () => {}, () => {}); assert.equal(h.loaded.length, 2);
  h.loaded[1].resolve(samples()); await flush();
  h.output.speak("message", {...settings, voice: "sentence:bf_emma"}, () => {}, () => {}); assert.equal(h.loaded.length, 3); h.output.dispose!();
});
