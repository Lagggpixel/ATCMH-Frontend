import assert from "node:assert/strict";
import test from "node:test";
import {browserPocketSpeechOutput, createPocketSpeechOutput, type PocketPlayback} from "./pocket-output";

const settings = {voice: "pocket:alba", rate: 1, volume: 1};
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const frame = Uint8Array.of(0, 0, 0, 4, 0, 64, 0, 192);
const done = Uint8Array.of(0, 0, 0, 0);

test("automatic voice uses George for preparation and playback", async () => {
  const requested: string[] = [];
  const playback: PocketPlayback = {activate() {}, begin() {}, append() {}, finish: async () => {}, cancel() {}, dispose() {}};
  const output = createPocketSpeechOutput(async (_text, voice) => {requested.push(voice); return new ReadableStream({start(c) {c.enqueue(done); c.close();}});}, playback);
  output.prepare?.("Radio ready", {...settings, voice: ""});
  output.speak("Radio ready", {...settings, voice: ""}, () => {}, () => {}); await tick();
  assert.deepEqual(requested, ["george"]); output.dispose?.();
});

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
  output.speak("Radio ready", settings, () => ended++, () => ended++); await tick(); output.cancel();
  resolve(new ReadableStream({start(c) {c.enqueue(frame); c.enqueue(done); c.close();}})); await tick();
  assert.equal(played, 0); assert.equal(ended, 0); output.dispose?.();
});

test("playback reuses an in-progress preparation instead of restarting it", async () => {
  const requests: {signal: AbortSignal; priority: string}[] = [];
  const playback: PocketPlayback = {activate() {}, begin() {}, append() {}, finish: async () => {}, cancel() {}, dispose() {}};
  const output = createPocketSpeechOutput((_text, _voice, signal, priority) => {
    requests.push({signal, priority});
    return new Promise(() => {});
  }, playback);
  output.prepare?.("Radio ready", settings);
  assert.equal(requests[0].priority, "prepare");
  output.speak("Radio ready", settings, () => {}, () => {}); await tick();
  assert.equal(requests[0].signal.aborted, false);
  assert.equal(requests.length, 1);
  output.dispose?.();
});

test("queued messages generate concurrently and a completed later message waits for its turn", async () => {
  const streams = new Map<string, ReadableStreamDefaultController<Uint8Array>>(), requested: string[] = [], played: number[] = [];
  const playback: PocketPlayback = {activate() {}, begin() {}, append(samples) {played.push(samples[0]);}, finish: async () => {}, cancel() {}, dispose() {}};
  const output = createPocketSpeechOutput(async text => {
    requested.push(text); return new ReadableStream({start(controller) {streams.set(text, controller);}});
  }, playback);
  output.prepare?.("first", settings); output.prepare?.("second", settings); output.prepare?.("third", settings);
  await tick(); assert.deepEqual(requested, ["first", "second", "third"]);
  streams.get("second")!.enqueue(frame); streams.get("second")!.enqueue(done); streams.get("second")!.close();
  let firstEnded = 0, secondEnded = 0;
  output.speak("first", settings, () => firstEnded++, () => assert.fail("first failed"));
  await tick(); assert.deepEqual(played, []);
  streams.get("first")!.enqueue(frame); streams.get("first")!.enqueue(done); streams.get("first")!.close();
  await tick(); assert.equal(firstEnded, 1); assert.deepEqual(played, [.5]);
  output.speak("second", settings, () => secondEnded++, () => assert.fail("second failed"));
  await tick(); assert.equal(secondEnded, 1); assert.deepEqual(played, [.5, .5]);
  assert.deepEqual(requested, ["first", "second", "third"]); output.dispose?.();
});

test("a prepared readback is reused only for the same voice and exact text", async () => {
  const requested: string[] = [];
  const playback: PocketPlayback = {activate() {}, begin() {}, append() {}, finish: async () => {}, cancel() {}, dispose() {}};
  const output = createPocketSpeechOutput(async (text, voice) => {
    requested.push(`${voice}:${text}`); return new ReadableStream({start(c) {c.enqueue(frame); c.enqueue(done); c.close();}});
  }, playback);
  output.prepareReadback?.("Roger", settings); await tick();
  output.speak("Unable", {...settings, voice: "pocket:george"}, () => {}, () => assert.fail("failed")); await tick();
  assert.deepEqual(requested, ["alba:Roger", "george:Unable"]); output.dispose?.();
});

test("failed background generation waits until playback to retry", async () => {
  let attempts = 0, ended = 0;
  const playback: PocketPlayback = {activate() {}, begin() {}, append() {}, finish: async () => {}, cancel() {}, dispose() {}};
  const output = createPocketSpeechOutput(async () => {
    if (++attempts === 1) throw new Error("busy");
    return new ReadableStream({start(c) {c.enqueue(frame); c.enqueue(done); c.close();}});
  }, playback);
  output.prepare?.("queued", settings); await tick();
  output.prepare?.("queued", settings); output.prepare?.("queued", settings); await tick();
  assert.equal(attempts, 1);
  output.speak("queued", settings, () => ended++, () => assert.fail("failed")); await tick();
  assert.equal(attempts, 2); assert.equal(ended, 1); output.dispose?.();
});

test("cancelling while browser activation is pending aborts the head request", async () => {
  let activate!: () => void, signal!: AbortSignal;
  const playback: PocketPlayback = {activate() {}, begin: () => new Promise<void>(resolve => {activate = resolve;}), append() {}, finish: async () => {}, cancel() {}, dispose() {}};
  const output = createPocketSpeechOutput(async (_text, _voice, requestSignal) => {signal = requestSignal; return new ReadableStream();}, playback);
  output.speak("Radio ready", settings, () => {}, () => {}); output.cancel(); activate(); await tick();
  assert.equal(signal.aborted, true); output.dispose?.();
});

test("audio activation can be retried after a rejected browser gesture", async () => {
  const previousWindow = globalThis.window, previousContext = globalThis.AudioContext;
  let attempts = 0;
  Object.defineProperty(globalThis, "window", {value: {}, configurable: true, writable: true});
  globalThis.AudioContext = class {
    state = "suspended";
    destination = {};
    createBuffer() {return {};}
    createBufferSource() {return {connect() {}, disconnect() {}, start() {}};}
    resume() {attempts++; return Promise.reject(new Error("NotAllowedError"));}
    close() {return Promise.resolve();}
  } as unknown as typeof AudioContext;
  try {
    const output = browserPocketSpeechOutput("synthetic")!;
    output.activate?.(); await tick(); output.activate?.(); await tick();
    assert.equal(attempts, 2); output.dispose?.();
  } finally {
    if (previousWindow === undefined) delete (globalThis as {window?: Window}).window;
    else globalThis.window = previousWindow;
    globalThis.AudioContext = previousContext;
  }
});

test("a pending iOS resume cannot prevent a later gesture from unlocking audio", () => {
  const previousWindow = globalThis.window, previousContext = globalThis.AudioContext;
  let attempts = 0, silentStarts = 0;
  Object.defineProperty(globalThis, "window", {value: {}, configurable: true, writable: true});
  globalThis.AudioContext = class {
    state = "suspended"; destination = {};
    createBuffer() {return {};}
    createBufferSource() {return {connect() {}, disconnect() {}, start() {silentStarts++;}};}
    resume() {attempts++; return new Promise<void>(() => {});}
    close() {return Promise.resolve();}
  } as unknown as typeof AudioContext;
  try {
    const output = browserPocketSpeechOutput("synthetic")!;
    output.activate?.(); output.activate?.();
    assert.equal(attempts, 2); assert.equal(silentStarts, 2); output.dispose?.();
  } finally {
    if (previousWindow === undefined) delete (globalThis as {window?: Window}).window;
    else globalThis.window = previousWindow;
    globalThis.AudioContext = previousContext;
  }
});

test("older WebKit audio contexts are available to Pocket playback", () => {
  const previousWindow = globalThis.window, previousContext = globalThis.AudioContext;
  const WebkitContext = class {} as unknown as typeof AudioContext;
  Object.defineProperty(globalThis, "window", {value: {webkitAudioContext: WebkitContext}, configurable: true, writable: true});
  delete (globalThis as {AudioContext?: typeof AudioContext}).AudioContext;
  try {assert.ok(browserPocketSpeechOutput("synthetic"));}
  finally {
    if (previousWindow === undefined) delete (globalThis as {window?: Window}).window;
    else globalThis.window = previousWindow;
    globalThis.AudioContext = previousContext;
  }
});

test("iPad media playback is requested and restored without overriding an active call", () => {
  const previousWindow = globalThis.window, previousContext = globalThis.AudioContext;
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const session = {type: "auto"};
  Object.defineProperty(globalThis, "window", {value: {}, configurable: true, writable: true});
  Object.defineProperty(globalThis, "navigator", {value: {audioSession: session}, configurable: true});
  globalThis.AudioContext = class {state = "running"; close() {return Promise.resolve();}} as unknown as typeof AudioContext;
  try {
    const output = browserPocketSpeechOutput("synthetic")!;
    output.activate?.(); assert.equal(session.type, "playback");
    session.type = "play-and-record"; output.activate?.(); output.dispose?.();
    assert.equal(session.type, "play-and-record");
    session.type = "auto";
    const another = browserPocketSpeechOutput("synthetic")!;
    another.activate?.(); assert.equal(session.type, "playback"); another.dispose?.();
    assert.equal(session.type, "auto");
  } finally {
    if (previousNavigator) Object.defineProperty(globalThis, "navigator", previousNavigator);
    else delete (globalThis as {navigator?: Navigator}).navigator;
    if (previousWindow === undefined) delete (globalThis as {window?: Window}).window;
    else globalThis.window = previousWindow;
    globalThis.AudioContext = previousContext;
  }
});
