import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {airportCallsign, airportList, getAirport} from "./airports";
import {engineFor} from "./engine";
import {catalogFor} from "./catalog";
import {radarInstructionText} from "./radar";
import {browserRecordedSpeechOutput, createRecordedSpeechOutput, decodeRecording, recordingParts, recordingWav, type RecordingLibrary, type RecordingPlayback} from "./recorded-output";
import {aviationSpeech, RadioAudio, type VoiceSettings} from "./radio-audio";
import {joinSpeechClips, trimSpeechClip} from "./speech-pcm";
import {RADIO_INITIALISMS} from "./radio-text";
import {CALLSIGN_OPERATORS} from "./callsigns";

const settings: VoiceSettings = {voice: "", rate: 1.15, volume: .6};
const sample = () => Float32Array.from({length: 2400}, (_, i) => Math.sin(i / 5) * .5);
const flush = () => new Promise(resolve => setImmediate(resolve));
const alphabet = "alpha bravo charlie delta echo foxtrot golf hotel india juliett kilo lima mike november oscar papa quebec romeo sierra tango uniform victor whiskey x ray yankee zulu zero one two three four five six seven eight nine".split(" ");

test("the shipped voice libraries cover every airport callsign, digits and NATO letters with playable PCM", async () => {
  const base = new URL("../../public/simulator/recordings-v1/", import.meta.url);
  const manifest = JSON.parse(await readFile(new URL("manifest.json", base), "utf8")) as {voices: Record<string, Record<string, string>>};
  const scenarioSource = await readFile(new URL("./point-merge-scenarios.ts", import.meta.url), "utf8");
  const airlineWords = [...scenarioSource.matchAll(/callsign: "([^"]+)"/g)].flatMap(match => match[1].toLowerCase().match(/\b[a-z]+\b/g) ?? []);
  const required = [...alphabet, ...RADIO_INITIALISMS.map(word => word.toLowerCase()), ...CALLSIGN_OPERATORS.flatMap(name => name.toLowerCase().split(/\s+/)), ...airlineWords, ...airportList.flatMap(airport => airportCallsign(airport).toLowerCase().split(/\s+/))];
  for (const voice of ["bf_emma", "bm_george", "af_heart"]) {
    for (const word of required) assert.ok(manifest.voices[voice][word], `${voice} must record ${word}`);
    for (const filename of Object.values(manifest.voices[voice])) {
      const bytes = await readFile(new URL(filename, base));
      const samples = decodeRecording(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      assert.ok(samples.length >= 240 && samples.some(value => Math.abs(value) > .008), `${filename} must contain speech`);
    }
  }
});

test("prerecorded phrases retain their cadence, and live runway/frequency/flight-level values retain every digit", () => {
  const vocabulary = new Set([...alphabet, "speedbird", "cleared for the ils approach", "runway", "left", "decimal", "flight level"]);
  const parts = recordingParts(aviationSpeech("Speedbird 104, cleared for the ILS approach, runway 09L. FL260, 121.80", ["Speedbird 104"]), vocabulary);
  assert.deepEqual(parts.map(p => p.key), ["speedbird", "one", "zero", "four", "cleared for the ils approach", "runway", "zero", "nine", "left", "flight level", "two", "six", "zero", "one", "two", "one", "decimal", "eight", "zero"]);
  assert.equal(parts[8].pause, .12);
  assert.deepEqual(recordingParts("Mach 0.75", new Set([...alphabet, "mach", "decimal"])).map(p => p.key), ["mach", "zero", "decimal", "seven", "five"]);
});

test("custom names and fixes are spelled from prerecorded phonetic letters instead of being skipped", () => {
  const parts = recordingParts("ÉXZQ Z123", new Set(alphabet));
  assert.deepEqual(parts.map(p => p.key), ["echo", "x", "ray", "zulu", "quebec", "zulu", "one", "two", "three"]);
  assert.deepEqual(recordingParts("!?", new Set(alphabet)), []);
});

test("every prerecorded voice says Japan Air as words and uses the ILS/GPS letter-name recordings", async () => {
  const manifest = JSON.parse(await readFile(new URL("../../public/simulator/recordings-v1/manifest.json", import.meta.url), "utf8")) as {voices: Record<string, Record<string, string>>};
  for (const clips of Object.values(manifest.voices)) {
    const vocabulary = new Set(Object.keys(clips));
    assert.deepEqual(recordingParts(aviationSpeech("Japan Air 514", ["Japan Air 514"]), vocabulary).map(p => p.key), ["japan air", "five", "one", "four"]);
    for (const acronym of ["ILS", "GPS"]) {
      const compact = `Japan Air 514, requesting ${acronym} approach runway 06`;
      const legacy = compact.replace(acronym, acronym.split("").join("-"));
      const parts = recordingParts(aviationSpeech(compact, ["Japan Air 514"]), vocabulary);
      assert.deepEqual(parts, recordingParts(aviationSpeech(legacy, ["Japan Air 514"]), vocabulary));
      assert.ok(parts.some(p => p.key === `requesting ${acronym.toLowerCase()} approach runway`));
      assert.ok(parts.every(p => vocabulary.has(p.key)));
      assert.ok(!parts.some(p => ["alpha", "india", "romeo", "lima", "sierra", "golf", "papa"].includes(p.key)));
    }
  }
});

test("actual approach messages use connected phrase recordings and short pauses in every voice", async () => {
  const manifest = JSON.parse(await readFile(new URL("../../public/simulator/recordings-v1/manifest.json", import.meta.url), "utf8")) as {voices: Record<string, Record<string, string>>};
  for (const clips of Object.values(manifest.voices)) {
    const vocabulary = new Set(Object.keys(clips));
    const parts = recordingParts(aviationSpeech("Ryanair 7VK, with you at 9000. Cleared ILS runway 06 approach.", ["Ryanair 7VK"]), vocabulary);
    assert.deepEqual(parts.map(p => p.key), ["ryanair", "seven", "victor", "kilo", "with you at", "nine", "thousand", "cleared ils runway", "zero", "six", "approach"]);
    assert.equal(parts[0].pause, 0, "recording envelopes already separate adjacent words");
    assert.ok(parts[3].pause > 0 && parts[3].pause < parts[6].pause, "commas separate clauses with a shorter pause than sentences");
    assert.deepEqual(recordingParts("until established on the localizer", vocabulary).map(p => p.key), ["until established on the localizer"]);
    for (const airline of ["Aegean", "Skymark", "Solaseed", "Starflyer"]) {
      assert.deepEqual(recordingParts(airline, vocabulary).map(p => p.key), [airline.toLowerCase()]);
    }
    for (const acronym of RADIO_INITIALISMS) {
      assert.deepEqual(recordingParts(aviationSpeech(acronym), vocabulary).map(p => p.key), [acronym.toLowerCase()]);
    }
  }
});

test("connected recordings match the engine's current approach request and clearance wording", async () => {
  const manifest = JSON.parse(await readFile(new URL("../../public/simulator/recordings-v1/manifest.json", import.meta.url), "utf8")) as {voices: Record<string, Record<string, string>>};
  const state = engineFor({airport: "EGPH", trainingStation: "EGPH:approach"}).initialExercise();
  const aircraft = state.aircraft[0], environment = state.radarEnvironment!, catalog = catalogFor(getAirport(state));
  const request = catalog.resolvePilotRequest({requestId: "request-approach"})!;
  for (const clips of Object.values(manifest.voices)) {
    const keys = (text: string) => recordingParts(aviationSpeech(text, [aircraft.callsign]), new Set(Object.keys(clips))).map(p => p.key);
    for (const type of ["ils", "gps", "visual"] as const) {
      const approach = environment.approaches.find(p => p.type === type)!;
      aircraft.radar!.expected = approach.id; aircraft.radar!.requestedApproach = undefined;
      const initial = keys(catalog.pilotRequestText(aircraft, request, approach.runway, false, {exercise: state}));
      assert.ok(initial.includes("edinburgh")); assert.ok(!initial.includes("with you at"));
      aircraft.radar!.requestedApproach = approach.id;
      const entry = keys(catalog.pilotRequestText(aircraft, request, approach.runway, false, {exercise: state}));
      assert.deepEqual(entry, initial);
      assert.ok(entry.every(key => Object.hasOwn(clips, key)));
      const clearance = keys(radarInstructionText(aircraft, {type: "vector", approachId: approach.id}, environment, getAirport(state))!);
      assert.ok(clearance.includes(type === "visual" ? "cleared visual approach runway" : `cleared ${type} runway`));
      if (type === "ils") assert.ok(clearance.includes("until established on the localizer"));
    }
  }
});

function harness() {
  const loaded: {voice: string; key: string}[] = [], played: {samples: Float32Array; settings: VoiceSettings; end: () => void}[] = [];
  let loads = 0, activated = 0, cancelled = 0, disposed = 0, ends = 0, errors = 0;
  const library: RecordingLibrary = {
    vocabulary: async () => {loads++; return new Set(["radio audio enabled", ...alphabet]);},
    clip: async (voice, key) => {loaded.push({voice, key}); return sample();},
  };
  const playback: RecordingPlayback = {
    activate: () => {activated++;}, cancel: () => {cancelled++;}, dispose: () => {disposed++;},
    play: (samples, _, settings) => new Promise(resolve => played.push({samples, settings, end: resolve})),
  };
  const output = createRecordedSpeechOutput(library, playback);
  const speak = (text = "Radio audio enabled.", options = settings) => output.speak(text, options, () => {ends++;}, () => {errors++;});
  return {output, library, playback, loaded, played, speak, loads: () => loads, activated: () => activated, cancelled: () => cancelled, disposed: () => disposed, ends: () => ends, errors: () => errors};
}

test("recordings load lazily with the selected voice, media speed and volume, and one radio effect per transmission", async () => {
  const h = harness();
  assert.equal(h.loads(), 0); assert.equal(h.output.voices().length, 3);
  h.output.activate!(); assert.equal(h.loads(), 0); assert.equal(h.activated(), 1);
  h.speak("Radio audio enabled.", {...settings, voice: "recorded:bm_george"}); await flush();
  assert.deepEqual(h.loaded, [{voice: "bm_george", key: "radio audio enabled"}]);
  assert.equal(h.played[0].settings.rate, 1.15); assert.equal(h.played[0].settings.volume, .6);
  assert.equal(h.played[0].samples.length, 2400 + .12 * 24000 + .14 * 24000);
  assert.ok(h.played[0].samples.every(x => Number.isFinite(x) && Math.abs(x) <= .861));
  h.played[0].end(); await flush(); assert.equal(h.ends(), 1); assert.equal(h.errors(), 0);
  h.output.dispose!(); assert.equal(h.disposed(), 1);
});

test("duplicate words share a clip request and the fetch pool is bounded", async () => {
  const h = harness(); let concurrent = 0, peak = 0;
  h.library.clip = async (voice, key) => {concurrent++; peak = Math.max(peak, concurrent); await flush(); concurrent--; h.loaded.push({voice, key}); return sample();};
  h.speak("one two three four five six seven eight nine one one");
  await flush(); await flush(); await flush();
  assert.equal(h.loaded.length, 9); assert.ok(peak <= 12); assert.ok(peak > 1);
  h.output.cancel(); h.played[0].end(); await flush(); assert.equal(h.ends(), 0);
});

test("the next queued transmission loads during playback and reuses its prepared audio", async () => {
  const h = harness(), player = new RadioAudio();
  const close = player.start(h.output);
  player.say("one"); await flush();
  assert.equal(h.played.length, 1);
  player.say("two"); await flush();
  assert.ok(h.loaded.some(clip => clip.key === "two"), "next call loads before the current call ends");
  assert.equal(h.played.length, 1, "lookahead cannot speak out of order");
  const requests = h.loaded.length;
  player.setSettings({rate: 2, volume: .3});
  h.played[0].end(); await flush();
  assert.equal(h.played.length, 2);
  assert.equal(h.loaded.length, requests, "prepared audio is not fetched a second time");
  assert.equal(h.played[1].settings.rate, 2, "prepared audio uses the latest playback settings");
  assert.equal(h.played[1].settings.volume, .3);
  close();
});

test("mute aborts speculative downloads and cannot start the queued call later", async () => {
  const h = harness(), player = new RadioAudio();
  const close = player.start(h.output);
  player.say("one"); await flush();
  let signal!: AbortSignal, resolve!: (samples: Float32Array) => void;
  h.library.clip = (_voice, _key, requestSignal) => {signal = requestSignal; return new Promise(done => {resolve = done;});};
  player.say("two"); await flush();
  player.setEnabled(false);
  assert.equal(signal.aborted, true);
  resolve(sample()); h.played[0].end(); await flush();
  assert.equal(h.played.length, 1);
  close();
});

test("recorded phrases compact internal silence before playback", async () => {
  const h = harness(), gap = new Float32Array(28800);
  gap.set(sample()); gap.set(sample(), 26400);
  h.library.clip = async () => gap;
  h.speak("one"); await flush();
  assert.ok(h.played[0].samples.length < 12000, "one second of internal silence is bounded without dropping either word");
  assert.deepEqual(gap.slice(0, 2400), sample(), "cached source audio is preserved");
  h.output.dispose!();
});

test("cancellation aborts in-flight files, and late downloads never restart stopped audio", async () => {
  const h = harness(); let resolve!: (samples: Float32Array) => void, signal!: AbortSignal;
  h.library.clip = (_voice, _key, requestSignal) => {signal = requestSignal; return new Promise(done => {resolve = done;});};
  h.speak(); await flush(); h.output.cancel(); assert.ok(signal.aborted);
  resolve(sample()); await flush(); assert.equal(h.played.length, 0); assert.equal(h.ends(), 0); assert.equal(h.errors(), 0);
});

test("unmount during manifest loading or playback suppresses callbacks", async () => {
  for (const phase of ["manifest", "playback"]) {
    const h = harness(); let resolve!: (vocabulary: ReadonlySet<string>) => void;
    if (phase === "manifest") h.library.vocabulary = () => new Promise(done => {resolve = done;});
    h.speak(); await flush(); h.output.dispose!();
    if (phase === "manifest") resolve(new Set(["radio audio enabled"])); else h.played[0].end();
    await flush(); assert.equal(h.ends(), 0); assert.equal(h.errors(), 0);
  }
});

test("missing clips fail once and a later gesture retries the retained transmission", async () => {
  const h = harness(), player = new RadioAudio(); let fail = true;
  h.library.clip = async () => {if (fail) throw new Error("404"); return sample();};
  const close = player.start(h.output);
  player.say("Radio audio enabled."); await flush();
  assert.ok(player.getSnapshot().error); assert.equal(player.getSnapshot().enabled, true);
  fail = false; player.activate(); await flush(); assert.equal(h.played.length, 1);
  h.played[0].end(); await flush(); assert.equal(player.getSnapshot().error, ""); assert.equal(player.getSnapshot().speaking, ""); close();
});

test("stalled file requests abort and report a retryable error", async t => {
  const h = harness(); t.mock.timers.enable({apis: ["setTimeout"]});
  h.library.vocabulary = (_voice, signal) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("Timeout"))));
  h.speak(); t.mock.timers.tick(15000); await flush(); assert.equal(h.errors(), 1); assert.equal(h.ends(), 0);
  h.output.dispose!(); t.mock.timers.reset();
});

test("PCM recordings round trip and corrupt or incompatible files are rejected", () => {
  const samples = sample(), decoded = decodeRecording(recordingWav(samples, 24000));
  assert.equal(decoded.length, samples.length); assert.ok(decoded.every((x, i) => Math.abs(x - samples[i]) < .0001));
  assert.throws(() => decodeRecording(new ArrayBuffer(12)));
  assert.throws(() => decodeRecording(recordingWav(samples, 48000)));
  const corrupt = recordingWav(samples, 24000); new DataView(corrupt).setUint32(40, 2, true); assert.throws(() => decodeRecording(corrupt));
});

test("real browser adapter plays with no speechSynthesis, Worker, AudioContext or WebAssembly", async () => {
  const descriptors = ["window", "Audio", "fetch"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  const instances: FakeAudio[] = [];
  class FakeAudio {
    preload = ""; src = ""; volume = 1; playbackRate = 1; preservesPitch = false;
    onended?: () => void; onerror?: () => void;
    constructor() {instances.push(this);}
    play() {return Promise.resolve();} pause() {} load() {} removeAttribute() {this.src = "";}
  }
  const requests: string[] = [];
  try {
    Object.defineProperty(globalThis, "window", {configurable: true, value: {}});
    Object.defineProperty(globalThis, "Audio", {configurable: true, value: FakeAudio});
    Object.defineProperty(globalThis, "fetch", {configurable: true, value: async (url: string) => {
      requests.push(url);
      return url.endsWith("manifest.json") ? Response.json({version: 1, voices: {bf_emma: {"radio audio enabled": "bf_emma/01234567890123456789.wav"}}}) : new Response(recordingWav(sample(), 24000));
    }});
    const output = browserRecordedSpeechOutput()!; assert.ok(output); assert.equal(requests.length, 0);
    let ended = 0; output.activate!();
    assert.match(instances[0].src, /^blob:/, "audio activation uses the site's allowed media format instead of a blocked data URL");
    output.speak("Radio audio enabled", settings, () => ended++, () => assert.fail("Prerecorded playback failed"));
    await flush(); assert.equal(requests.length, 2); assert.ok(requests.every(url => url.startsWith("/simulator/recordings-v1/")));
    assert.match(instances[0].src, /^blob:/); assert.equal(instances[0].playbackRate, 1.15); assert.equal(instances[0].volume, .6);
    assert.equal(instances[0].preservesPitch, true);
    instances[0].onended!(); await flush(); assert.equal(ended, 1);
    output.speak("Radio audio enabled", settings, () => ended++, () => assert.fail("Replay failed"));
    await flush(); assert.equal(requests.length, 2, "replay reuses the manifest and decoded clips");
    output.cancel(); assert.equal(ended, 1, "cancelling a replay cannot complete it");
    output.dispose!();
  } finally {
    for (const [key, descriptor] of descriptors) {if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);}
  }
});


test("shipped callsign digits join without their repeated quiet envelopes in every voice", async () => {
  const base = new URL("../../public/simulator/recordings-v1/", import.meta.url);
  const manifest = JSON.parse(await readFile(new URL("manifest.json", base), "utf8")) as {voices: Record<string, Record<string, string>>};
  for (const [voice, files] of Object.entries(manifest.voices)) {
    const clips = await Promise.all(["one", "zero", "four"].map(async key => {
      const bytes = await readFile(new URL(files[key], base));
      return decodeRecording(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    }));
    const joined = joinSpeechClips(clips.map(samples => ({samples, pause: 0})), 24000);
    const originalLength = clips.reduce((sum, samples) => sum + samples.length, 0);
    assert.ok(joined.length <= originalLength - .08 * 24000, `${voice}: remove at least 80 ms of repeated silence`);
    for (const clip of clips) {
      const trimmed = trimSpeechClip(clip, 24000);
      assert.ok(trimmed.length > clip.length * .6, "trim only the quiet envelope");
      assert.equal(Math.max(...trimmed), Math.max(...clip), "preserve peak speech energy");
    }
  }
});
