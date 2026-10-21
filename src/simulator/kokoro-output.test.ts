import assert from "node:assert/strict";
import test from "node:test";
import {createKokoroSpeechOutput, browserRadioSpeechOutput, type SpeechClip, type KokoroSynthesis, type RadioPlayback} from "./kokoro-output";
import {RadioAudio, type SpeechOutput, type VoiceSettings} from "./radio-audio";
import {radioEffect} from "./radio-effect";
import {initialExercise} from "./engine";

const clip = (): SpeechClip => ({samples: Float32Array.from({length: 2400}, (_, i) => Math.sin(2 * Math.PI * 1000 * i / 24000) * .3), sampleRate: 24000});
const settings: VoiceSettings = {voice: "", rate: 1.15, volume: .4, allowOnline: false};
const flush = () => new Promise(resolve => setImmediate(resolve));
function setup() {
  const generated: {text: string; voice: string; speed: number; resolve: (clip: SpeechClip) => void; reject: (error: Error) => void}[] = [];
  const played: {clip: SpeechClip; volume: number; resolve: () => void; reject: (error: Error) => void}[] = [];
  const fallbackCalls: {text: string; settings: VoiceSettings; end: () => void; error: () => void}[] = [];
  let synthesisCreated = 0, cancelled = 0, disposed = 0, activated = 0, ended = 0, errors = 0;
  const synthesis: KokoroSynthesis = {
    generate: (text, voice, speed) => new Promise((resolve, reject) => generated.push({text, voice, speed, resolve, reject})),
    cancel: () => {cancelled++;}, dispose: () => {disposed++;},
  };
  const playback: RadioPlayback = {
    play: (clip, volume) => new Promise((resolve, reject) => played.push({clip, volume, resolve, reject})),
    activate: () => {activated++;}, cancel: () => {}, dispose: () => {},
  };
  const fallback: SpeechOutput = {
    voices: () => [{id: "browser-local", name: "Local English", language: "en-GB", local: true}],
    onVoicesChanged: () => () => {}, cancel: () => {},
    speak: (text, settings, end, error) => fallbackCalls.push({text, settings, end, error}),
  };
  const output = createKokoroSpeechOutput(fallback, () => {synthesisCreated++; return synthesis;}, () => playback);
  const statuses: string[] = []; output.onStatusChanged!(value => statuses.push(value));
  const speak = (options = settings, text = "Speedbird one two three, cleared to land.") => output.speak(text, options, () => {ended++;}, () => {errors++;});
  return {output, generated, played, fallbackCalls, statuses, speak, synthesisCreated: () => synthesisCreated, cancelled: () => cancelled, disposed: () => disposed, activated: () => activated, ended: () => ended, errors: () => errors};
}

test("Kokoro is lazy, defaults to Emma at the selected speed, and applies radio PCM at the selected volume", async () => {
  const h = setup();
  assert.equal(h.synthesisCreated(), 0); assert.equal(browserRadioSpeechOutput(), null);
  assert.equal(h.output.voices().filter(v => v.id.startsWith("kokoro:")).length, 3);
  h.output.activate!(); assert.equal(h.activated(), 1); assert.equal(h.synthesisCreated(), 0);
  h.speak(); assert.equal(h.generated[0].voice, "bf_emma"); assert.equal(h.generated[0].speed, 1.15);
  const audio = clip(); h.generated[0].resolve(audio); await flush();
  assert.equal(h.played.length, 1); assert.equal(h.played[0].volume, .4);
  assert.ok(h.played[0].clip.samples.length > audio.samples.length, "squelch surrounds the generated speech");
  assert.equal(h.ended(), 0); h.played[0].resolve(); await flush(); assert.equal(h.ended(), 1);
  assert.equal(h.fallbackCalls.length, 0); assert.match(h.statuses[0], /Preparing/);
  h.output.dispose!();
});

test("explicit browser voice bypasses model loading and retains the existing consent settings", () => {
  const h = setup(); const options = {...settings, voice: "browser-online", allowOnline: true}; h.speak(options);
  assert.deepEqual(h.fallbackCalls[0].settings, options); assert.equal(h.synthesisCreated(), 0);
  h.fallbackCalls[0].end(); h.fallbackCalls[0].error(); assert.equal(h.ended(), 1); assert.equal(h.errors(), 0);
});

test("model failure falls back once without passing an AI ID or granting online consent", async () => {
  const h = setup(); h.speak({...settings, voice: "kokoro:bm_george", allowOnline: true});
  h.generated[0].reject(new Error("Download blocked")); await flush();
  assert.equal(h.fallbackCalls.length, 1); assert.equal(h.fallbackCalls[0].settings.voice, "");
  assert.equal(h.fallbackCalls[0].settings.allowOnline, true, "browser automatic selection still requires a local English voice");
  h.fallbackCalls[0].end(); assert.equal(h.ended(), 1);
  h.speak(); assert.equal(h.generated.length, 1); assert.equal(h.fallbackCalls.length, 2);
  assert.match(h.statuses.at(-1)!, /unavailable/);
});

test("failed fallback preserves a retryable failure instead of silently dropping a transmission", async () => {
  const h = setup(); h.speak(); h.generated[0].reject(new Error("Failed")); await flush();
  h.fallbackCalls[0].error(); assert.equal(h.errors(), 1); assert.equal(h.ended(), 0);
});

test("malformed generated audio and playback errors use the browser fallback", async () => {
  for (const badAudio of [false, true]) {
    const h = setup(); h.speak(); h.generated[0].resolve(badAudio ? {samples: new Float32Array([NaN]), sampleRate: 24000} : clip()); await flush();
    if (!badAudio) {h.played[0].reject(new Error("Audio unavailable")); await flush();}
    assert.equal(h.fallbackCalls.length, 1); assert.equal(h.disposed(), 1);
  }
});

test("cancelled synthesis, failure and playback cannot start a fallback or complete stale speech", async () => {
  for (const result of ["resolve", "reject", "playback"] as const) {
    const h = setup(); h.speak();
    if (result === "playback") {h.generated[0].resolve(clip()); await flush();}
    h.output.cancel();
    if (result === "reject") h.generated[0].reject(new Error("Late failure"));
    else if (result === "resolve") h.generated[0].resolve(clip());
    else h.played[0].resolve();
    await flush(); assert.equal(h.fallbackCalls.length, 0); assert.equal(h.ended(), 0); assert.equal(h.errors(), 0);
    assert.equal(h.played.length, result === "playback" ? 1 : 0);
  }
});

test("replay cache includes voice and speed while volume stays a playback setting", async () => {
  const h = setup(); h.speak(); h.generated[0].resolve(clip()); await flush(); h.played[0].resolve(); await flush();
  h.speak({...settings, volume: .8}); await flush(); assert.equal(h.generated.length, 1); assert.equal(h.played[1].volume, .8);
  h.played[1].resolve(); await flush();
  h.speak({...settings, rate: 1.2}); assert.equal(h.generated.length, 2);
  h.generated[1].resolve(clip()); await flush(); h.played[2].resolve(); await flush();
  h.speak({...settings, voice: "kokoro:af_heart"}); assert.equal(h.generated.length, 3); assert.equal(h.generated[2].voice, "af_heart");
});

test("PCM cache evicts old entries and teardown releases worker resources", async () => {
  const h = setup();
  for (let i = 0; i < 13; i++) {h.speak(settings, `Message ${i}`); h.generated[i].resolve(clip()); await flush(); h.played[i].resolve(); await flush();}
  h.speak(settings, "Message 0"); assert.equal(h.generated.length, 14);
  h.output.dispose!(); h.generated[13].resolve(clip()); await flush(); assert.equal(h.played.length, 13);
  assert.ok(h.cancelled() > 0); assert.equal(h.disposed(), 1);
});

test("radio queue preserves pause/resume and suppresses AI results after disconnect", async () => {
  const h = setup(), player = new RadioAudio(); const close = player.start(h.output);
  assert.equal(player.getSnapshot().rate, 1.3);
  const initial = initialExercise(); player.observe(initial, true, "all");
  const state = {...initial, messages: [{id: "fresh", aircraftId: initial.aircraft[0].id, sender: "controller" as const, time: 1, frequency: "tower" as const, text: "Runway 24, cleared for takeoff."}]};
  player.observe(state, true, "all"); assert.equal(h.generated.length, 1);
  player.observe(state, true, "all", true); h.generated[0].resolve(clip()); await flush(); assert.equal(h.played.length, 0);
  player.observe(state, true, "all", false); assert.equal(h.generated.length, 2);
  player.observe(state, false, "all"); h.generated[1].resolve(clip()); await flush(); assert.equal(h.played.length, 0);
  close(); assert.equal(h.disposed(), 1);
});

test("radio effect removes out-of-band content, preserves intelligibility band and cannot clip", () => {
  const sampleRate = 24000, length = 24000;
  const mixed = Float32Array.from({length}, (_, i) => [100, 1000, 8000].reduce((v, f) => v + Math.sin(2 * Math.PI * f * i / sampleRate) * .2, 0));
  const result = radioEffect(mixed, sampleRate), offset = Math.round(sampleRate * .07);
  const energy = (frequency: number) => {
    let real = 0, imaginary = 0;
    for (let i = 2000; i < length - 2000; i++) {real += result[offset + i] * Math.cos(2 * Math.PI * frequency * i / sampleRate); imaginary += result[offset + i] * Math.sin(2 * Math.PI * frequency * i / sampleRate);}
    return Math.hypot(real, imaginary);
  };
  assert.ok(energy(1000) > energy(100) * 5); assert.ok(energy(1000) > energy(8000) * 5);
  assert.ok(result.every(x => Number.isFinite(x) && Math.abs(x) <= .861));
  assert.throws(() => radioEffect(new Float32Array(0), sampleRate));
  assert.throws(() => radioEffect(new Float32Array([Infinity]), sampleRate));
});

test("a stalled or crashed real worker adapter terminates and falls back without repeated model waits", async t => {
  t.mock.timers.enable({apis: ["setTimeout"]});
  const descriptors = ["window", "Worker", "SpeechSynthesisUtterance"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  try {
    for (const failure of ["timeout", "crash"]) {
      const workers: FakeWorker[] = [];
      let terminated = 0;
      const spoken: {text: string; voice?: {voiceURI: string}}[] = [];
      class FakeWorker {
        onmessage?: (event: unknown) => void;
        onerror?: (event: {preventDefault(): void}) => void;
        constructor() {workers.push(this);}
        postMessage() {}
        terminate() {terminated++;}
      }
      class Utterance {constructor(public text: string) {}}
      const synth = {getVoices: () => [{voiceURI: "local", name: "Local", lang: "en-GB", localService: true}], addEventListener() {}, removeEventListener() {}, cancel() {}, speak: (value: {text: string}) => spoken.push(value)};
      Object.defineProperty(globalThis, "window", {configurable: true, value: {Worker: FakeWorker, AudioContext: class {}, WebAssembly, speechSynthesis: synth, SpeechSynthesisUtterance: Utterance}});
      Object.defineProperty(globalThis, "Worker", {configurable: true, value: FakeWorker});
      Object.defineProperty(globalThis, "SpeechSynthesisUtterance", {configurable: true, value: Utterance});
      const output = browserRadioSpeechOutput()!;
      output.speak("Test transmission", settings, () => {}, () => assert.fail("Local fallback must be available"));
      assert.ok(workers[0]);
      if (failure === "timeout") t.mock.timers.tick(45_000);
      else workers[0].onerror!({preventDefault() {}});
      await flush(); assert.equal(terminated, 1); assert.equal(spoken.length, 1); assert.equal(spoken[0].voice?.voiceURI, "local");
      output.speak("Next transmission", settings, () => {}, () => assert.fail("Fallback failed"));
      assert.equal(spoken.length, 2); assert.equal(terminated, 1);
      output.dispose!();
    }
  } finally {
    for (const [key, descriptor] of descriptors) {if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);}
    t.mock.timers.reset();
  }
});


test("whole-message playback removes long digit gaps before applying one radio effect", async () => {
  const h = setup(); h.speak(settings, "Speedbird one zero four, with you at four thousand");
  const word = clip(), samples = new Float32Array(word.samples.length * 2 + 24000);
  samples.set(word.samples); samples.set(word.samples, word.samples.length + 24000);
  h.generated[0].resolve({samples, sampleRate: 24000}); await flush();
  assert.equal(h.generated.length, 1, "a transmission is synthesized as continuous speech");
  assert.equal(h.played.length, 1);
  assert.ok(h.played[0].clip.samples.length < samples.length - 12000);
  assert.ok(h.played[0].clip.samples.every(Number.isFinite));
  h.played[0].resolve(); await flush(); assert.equal(h.ended(), 1);
  h.output.dispose!();
});
