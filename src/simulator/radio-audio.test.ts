import assert from "node:assert/strict";
import test from "node:test";
import {advance, applyEnvelope, autoReadbacks, initialExercise} from "./engine";
import type {Exercise, Message} from "./model";
import {RadioAudio, aviationSpeech, browserAudioPreference, browserSpeechOutput, type SpeechOutput, type VoiceSettings} from "./radio-audio";
import {RADIO_INITIALISMS, radioDisplayText, radioInitialismSpeech} from "./radio-text";

const message = (id: string, frequency: Message["frequency"] = "ground", sender: Message["sender"] = "controller"): Message => ({id, frequency, sender, aircraftId: "demo-ground", time: 1, text: `Easy 571, taxi to Runway 24, hold short (${id})`});
// Most queue tests exercise order independently of the real gap; the timing test below uses the default timer.
const immediatePlayer = () => new RadioAudio(callback => {callback(); return undefined as unknown as ReturnType<typeof setTimeout>;});
function harness(scope: "all" | "ground" | "tower" = "all") {
  const played: {text: string; settings: VoiceSettings; end: () => void; error: (reason?: unknown) => void}[] = [];
  let cancelled = 0, voiceListener = () => {};
  const output: SpeechOutput = {
    voices: () => [{id: "local", name: "Local English", language: "en-GB", local: true}],
    onVoicesChanged: listener => {voiceListener = listener; return () => {voiceListener = () => {};};},
    speak: (text, settings, end, error) => {played.push({text, settings: {...settings}, end, error});},
    cancel: () => {cancelled++;},
  };
  const player = immediatePlayer();
  const close = player.start(output);
  let exercise = initialExercise();
  player.observe(exercise, true, scope);
  const enable = () => {player.setEnabled(true); played.at(-1)!.end(); played.length = 0;};
  const observe = (messages: Message[], connected = true, nextScope = scope) => {exercise = {...exercise, revision: exercise.revision + 1, messages}; player.observe(exercise, connected, nextScope);};
  return {player, played, enable, observe, close, output, voiceChange: () => voiceListener(), cancelled: () => cancelled};
}

test("radio defaults on, loads device voices and is safe during server rendering", () => {
  const h = harness();
  assert.equal(h.player.getSnapshot().enabled, true);
  assert.equal(h.player.getSnapshot().rate, 1);
  assert.equal(h.player.getSnapshot().voices[0].id, "local");
  assert.equal(h.played.length, 0); // Mounting does not produce an announcement.
  h.observe([message("fresh")]); assert.equal(h.played.length, 1);
  assert.equal(browserSpeechOutput(), null);
  h.close();
});

test("new voice preferences reset once, preserve mute, and remember later choices", () => {
  const previousWindow = globalThis.window, values = new Map<string, string>();
  const localStorage = {getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value)};
  Object.defineProperty(globalThis, "window", {value: {localStorage}, configurable: true, writable: true});
  try {
    values.set("simulator:radio-audio:v1:account:staff", "false");
    const preference = browserAudioPreference("account", "staff"), h = harness(); h.close();
    let close = h.player.start(h.output, preference);
    assert.equal(h.player.getSnapshot().voice, ""); assert.equal(h.player.getSnapshot().rate, 1);
    assert.equal(h.player.getSnapshot().enabled, false);
    h.player.setSettings({voice: "local", rate: 1.7}); close();
    close = h.player.start(h.output, preference);
    assert.equal(h.player.getSnapshot().voice, "local"); assert.equal(h.player.getSnapshot().rate, 1.7);
    assert.equal(h.player.getSnapshot().enabled, false);
    assert.equal(browserAudioPreference("another", "staff").readVoiceSettings?.(), undefined);
    close();
  } finally {
    if (previousWindow === undefined) delete (globalThis as {window?: Window}).window;
    else globalThis.window = previousWindow;
  }
});

test("opening a session prepares its published ATIS silently and never prepares while muted or paused", () => {
  const h = harness(), prepared: string[] = [];
  h.output.prepare = text => prepared.push(text);
  const player = new RadioAudio(), close = player.start(h.output);
  const exercise = {...initialExercise(), publishedAtis: "Edinburgh information Alpha. Wind 240 at 5."};
  player.observe(exercise, true, "tower");
  assert.equal(prepared.length, 1); assert.match(prepared[0], /Wind two four zero at five/);
  assert.equal(h.played.length, 0);
  player.observe(exercise, true, "tower"); assert.equal(prepared.length, 1, "repeated frames do not repeat preparation");
  close(); h.close();
  for (const muted of [true, false]) {
    const another = new RadioAudio(), cleanup = another.start(h.output, {read: () => !muted, write() {}});
    another.observe(exercise, true, "tower", !muted); assert.equal(prepared.length, 1); cleanup();
  }
});

test("reviewed drafts debounce without transmitting, and cancel on replacement, mute or pause", t => {
  t.mock.timers.enable({apis: ["setTimeout"]});
  const h = harness(), drafts: string[] = [];
  h.output.prepareDraft = text => {drafts.push(text);};
  const cleanup = h.player.prepareDraft("old draft");
  t.mock.timers.tick(400); cleanup();
  h.player.prepareDraft("Fly heading 90"); t.mock.timers.tick(499); assert.equal(drafts.length, 0);
  t.mock.timers.tick(1); assert.deepEqual(drafts, ["Fly heading zero nine zero"]); assert.equal(h.played.length, 0);
  h.player.prepareDraft("muted draft"); h.player.setEnabled(false); t.mock.timers.tick(500); assert.equal(drafts.length, 1);
  h.enable(); h.player.prepareDraft("paused draft"); h.player.observe(initialExercise(), true, "all", true);
  t.mock.timers.tick(500); assert.equal(drafts.length, 1); assert.equal(h.played.length, 0);
  h.close(); t.mock.timers.reset();
});
test("new controller and pilot transmissions play in order once across repeated snapshots", () => {
  const h = harness(); h.enable();
  const messages = [message("command"), message("readback", "ground", "pilot")];
  h.observe(messages); h.observe(messages);
  assert.equal(h.played.length, 1);
  assert.match(h.played[0].text, /Runway two four/);
  h.played[0].end(); assert.equal(h.played.length, 2);
  assert.match(h.played[1].text, /^Easy five seven one/);
  h.played[1].end(); h.observe(messages); assert.equal(h.played.length, 2);
  h.close();
});
test("queued transmissions wait 500 ms after the preceding audio, including when they arrive during the gap", t => {
  t.mock.timers.enable({apis: ["setTimeout"]});
  const played: {end: () => void}[] = [];
  const output: SpeechOutput = {voices: () => [{id: "v", name: "Voice", language: "en-GB", local: true}], onVoicesChanged: () => () => {},
    speak: (_text, _settings, end) => {played.push({end});}, cancel() {}};
  const player = new RadioAudio(), close = player.start(output);
  const state = initialExercise(); player.observe(state, true, "all");
  player.observe({...state, messages: [message("one")]}, true, "all");
  assert.equal(played.length, 1); played[0].end();
  t.mock.timers.tick(200);
  player.observe({...state, messages: [message("one"), message("two")]}, true, "all");
  t.mock.timers.tick(299); assert.equal(played.length, 1);
  t.mock.timers.tick(1); assert.equal(played.length, 2);
  close(); t.mock.timers.reset();
});

test("automatic readback is prepared from the pending command and only the actual reply is played", () => {
  const h = harness(), prepared: string[] = [];
  h.output.prepareReadback = text => prepared.push(text);
  let state = {...initialExercise(), running: true, autoReadback: true};
  h.player.observe(state, true, "all");
  const sent = applyEnvelope(state, {id: "command", time: 1, action: {kind: "command", aircraftId: "demo-ground", frequency: "ground", text: "Easy 571, hold position", command: {type: "stop"}}});
  assert.equal(sent.error, undefined); state = sent.state;
  h.player.observe(state, true, "all"); h.player.observe(state, true, "all");
  assert.equal(prepared.length, 1); assert.equal(h.played.length, 1);
  state = autoReadbacks(advance(state, 1.5), 2000, () => "reply");
  const reply = state.messages.at(-1)!;
  assert.equal(prepared[0], aviationSpeech(reply.text, state.aircraft.map(a => a.callsign)));
  h.player.observe(state, true, "all"); h.played[0].end();
  assert.equal(h.played[1].text, prepared[0]); h.close();
});
test("a speculative readback cannot play when the authoritative reply is unable", () => {
  const h = harness(), prepared: string[] = [];
  h.output.prepareReadback = text => prepared.push(text);
  let state = {...initialExercise(), running: true, autoReadback: true};
  h.player.observe(state, true, "all");
  const sent = applyEnvelope(state, {id: "clearance", time: 1, action: {kind: "command", aircraftId: "demo-air", frequency: "tower", text: "Speedbird 124, cleared for takeoff runway 24", command: {type: "takeoff", runway: "24"}}});
  assert.equal(sent.error, undefined); state = sent.state; h.player.observe(state, true, "all");
  assert.equal(prepared.length, 1); assert.doesNotMatch(prepared[0], /^Unable/);
  state = autoReadbacks(advance(state, 1.5), 2000, () => "unable");
  assert.match(state.messages.at(-1)!.text, /^Unable/);
  h.player.observe(state, true, "all"); h.played[0].end();
  assert.match(h.played[1].text, /^Unable/); assert.notEqual(h.played[1].text, prepared[0]); h.close();
});
test("muted history stays silent but an unseen readback arriving during reconnect is retained", () => {
  const h = harness(); h.player.setEnabled(false); h.observe([message("old")]); h.enable();
  h.observe([message("old")]); assert.equal(h.played.length, 0);
  h.observe([message("old")], false); h.observe([message("old"), message("while-offline")], true);
  assert.equal(h.played.length, 1);
  h.played[0].end();
  h.observe([message("old"), message("while-offline"), message("new")]); assert.equal(h.played.length, 2);
  h.close();
});

test("explicit audio choice survives remounts without persisting online consent or playback failures", () => {
  const h = harness();
  let saved: boolean | undefined;
  const preference = {read: () => saved, write: (enabled: boolean) => {saved = enabled;}};
  const first = new RadioAudio(); const close = first.start(h.output, preference);
  assert.equal(first.getSnapshot().enabled, true);
  assert.equal(saved, undefined);
  first.setEnabled(false); assert.equal(saved, false); close();
  const muted = new RadioAudio(); const closeMuted = muted.start(h.output, preference);
  assert.equal(muted.getSnapshot().enabled, false);
  muted.setEnabled(true); assert.equal(saved, true);
  muted.setSettings({allowOnline: true, voice: "provider"}); closeMuted();
  const enabled = new RadioAudio(); const closeEnabled = enabled.start(h.output, preference);
  assert.equal(enabled.getSnapshot().enabled, true);
  assert.equal(enabled.getSnapshot().allowOnline, false);
  assert.equal(enabled.getSnapshot().voice, "");
  enabled.say("New message"); h.played.at(-1)!.error();
  assert.equal(enabled.getSnapshot().enabled, true);
  assert.equal(saved, true); // A browser failure is not a user mute choice.
  closeEnabled(); h.close();
});
test("mentee hears both frequencies and retuning preserves current and queued speech", () => {
  const h = harness("ground"); h.enable();
  h.observe([message("tower", "tower")]); assert.equal(h.played.length, 1);
  h.observe([message("tower", "tower"), message("ground")]); assert.equal(h.played.length, 1);
  h.observe([message("tower", "tower"), message("ground")], true, "tower");
  assert.equal(h.cancelled(), 0); assert.equal(h.played.length, 1);
  h.played[0].end(); assert.equal(h.played.length, 2);
  h.observe([message("tower", "tower"), message("ground"), message("tower-new", "tower")], true, "tower");
  h.played[1].end(); assert.equal(h.played.length, 3);
  h.observe([message("tower", "tower"), message("ground"), message("tower-new", "tower")], true, "ground");
  assert.equal(h.cancelled(), 0); assert.equal(h.played.length, 3);
  h.close();
});
test("staff hears all frequencies independent of the selected aircraft", () => {
  const h = harness("all"); h.enable();
  h.observe([message("ground"), message("tower", "tower")]); h.played[0].end();
  assert.equal(h.played.length, 2); h.close();
});
test("mute clears pending speech and late browser callbacks cannot restart it", () => {
  const h = harness(); h.enable(); h.observe([message("one"), message("two")]);
  h.player.setEnabled(false); h.played[0].end();
  assert.equal(h.cancelled(), 1); assert.equal(h.played.length, 1);
  h.enable(); h.observe([message("one"), message("two")]); assert.equal(h.played.length, 0); h.close();
});
test("disconnect and exercise reset cancel queued speech", () => {
  const h = harness(); h.enable(); h.observe([message("one"), message("two")]);
  h.observe([message("one"), message("two")], false); assert.equal(h.cancelled(), 1);
  h.played[0].end(); assert.equal(h.played.length, 1);
  h.observe([], true); h.observe([message("fresh")]); assert.equal(h.played.length, 2);
  h.observe([]); assert.equal(h.cancelled(), 3); h.close();
});
test("Delta 64's takeoff readback is played once after a brief connection interruption", () => {
  const h = harness(); h.enable();
  const clearance = {...message("delta-clearance", "tower"), text: "Delta 64, cleared for takeoff runway 31L"};
  const readback = {...message("delta-readback", "tower", "pilot"), commandId: clearance.id, text: "Cleared for takeoff runway 31L, Delta 64"};
  h.observe([clearance]); h.played[0].end();
  h.observe([clearance], false);
  h.observe([clearance, readback], false);
  assert.equal(h.played.length, 1);
  h.observe([clearance, readback], true);
  assert.equal(h.played.length, 2); assert.match(h.played[1].text, /Runway three one left/i);
  h.played[1].end(); h.observe([clearance, readback]); assert.equal(h.played.length, 2); h.close();
});
test("changing exercise or resetting elapsed time establishes a fresh baseline", () => {
  const h = harness(); h.enable();
  const state: Exercise = {...initialExercise("exercise-a"), elapsed: 60, messages: [message("history")]};
  h.player.observe(state, true, "all"); assert.equal(h.played.length, 0);
  h.player.observe({...state, messages: [...state.messages, message("new")]}, true, "all"); assert.equal(h.played.length, 1);
  h.player.observe({...state, elapsed: 0}, true, "all"); assert.equal(h.cancelled(), 1); h.close();
});
test("voice settings apply to the next message and tests/replays queue without interrupting speech", () => {
  const h = harness(); h.enable(); h.player.setSettings({voice: "local", rate: 1.2, volume: 0.5});
  h.observe([message("one"), message("two")]);
  assert.deepEqual(h.played[0].settings, {voice: "local", rate: 1.2, volume: 0.5, allowOnline: false});
  h.player.say("Test Runway 06"); assert.equal(h.cancelled(), 0);
  h.played[0].end(); h.played[1].end(); assert.equal(h.played.length, 3);
  assert.equal(h.played[2].text, "Test Runway zero six"); h.close();
});

test("a published ATIS is read in full once, across retuning and new messages", () => {
  const h = harness("ground");
  const state = {...initialExercise(), publishedAtis: "Edinburgh information ALPHA. Runway 24. Wind 240 at 10. QNH 1001. Advise on initial contact."};
  h.player.observe(state, true, "ground");
  assert.equal(h.played.length, 1); assert.equal(h.played[0].text, aviationSpeech(state.publishedAtis));
  h.player.observe(state, true, "tower");
  h.player.observe({...state, messages: [message("ground"), message("tower", "tower")]}, true, "atis");
  h.player.say(state.publishedAtis);
  assert.equal(h.cancelled(), 0); assert.equal(h.played.length, 1);
  h.played[0].end(); h.played[1].end(); h.played[2].end();
  assert.equal(h.played.length, 4); assert.equal(h.played[3].text, aviationSpeech(state.publishedAtis));
  h.close();
});

test("ATIS history and muted/offline publications never replay on recovery", () => {
  const h = harness();
  h.player.setEnabled(false);
  const state = {...initialExercise(), publishedAtis: "Edinburgh information BRAVO."};
  h.player.observe(state, true, "atis");
  h.enable(); h.player.observe(state, true, "ground");
  assert.equal(h.played.length, 0);
  h.player.observe({...state, publishedAtis: "Edinburgh information CHARLIE."}, false, "tower");
  h.player.observe({...state, publishedAtis: "Edinburgh information CHARLIE."}, true, "tower");
  assert.equal(h.played.length, 0); h.close();
});
test("repeated autoplay denials during one tap never discard the queued transmission", () => {
  const h = harness(); h.observe([message("blocked")]);
  for (let attempt = 0; attempt < 5; attempt++) {
    h.played.at(-1)!.error(new DOMException("Interaction required", "NotAllowedError"));
    assert.equal(h.player.getSnapshot().enabled, true);
    h.player.activate();
    assert.equal(h.played.at(-1)!.text, h.played[0].text);
  }
  h.played.at(-1)!.end(); assert.equal(h.player.getSnapshot().speaking, ""); assert.equal(h.player.getSnapshot().error, "");
  h.close();
});

test("autoplay failures preserve enabled audio and retry the queued message on the next interaction", () => {
  const h = harness(); h.enable(); h.observe([message("one"), message("two")]); h.played[0].error();
  assert.equal(h.player.getSnapshot().enabled, true); assert.match(h.player.getSnapshot().error, /Click or press a key/);
  h.played[0].end(); assert.equal(h.played.length, 1);
  h.observe([message("one"), message("two"), message("three")]); assert.equal(h.played.length, 1, "snapshots do not endlessly retry blocked speech");
  h.player.activate(); assert.equal(h.played.length, 2); assert.equal(h.played[1].text, h.played[0].text);
  assert.equal(h.player.getSnapshot().error, "");
  h.played[1].end(); h.played[2].end(); assert.equal(h.played.length, 4);
  h.close();
});

test("asynchronous device voices automatically start queued speech without toggling audio", () => {
  const h = harness(); let ready = false;
  h.output.voices = () => ready ? [{id: "local", name: "English", language: "en-GB", local: true}] : [];
  h.voiceChange(); h.observe([message("early"), message("second")]);
  assert.equal(h.played.length, 0); assert.equal(h.player.getSnapshot().enabled, true);
  h.player.activate(); assert.equal(h.played.length, 0);
  ready = true; h.voiceChange(); assert.equal(h.played.length, 1);
  h.played[0].end(); assert.equal(h.played.length, 2);
  h.close();
});

test("explicit mute while autoplay is blocked discards speech and prevents interaction-based retries", () => {
  const h = harness(); h.observe([message("blocked")]); h.played[0].error();
  h.player.setEnabled(false); h.player.activate(); h.voiceChange();
  assert.equal(h.player.getSnapshot().enabled, false); assert.equal(h.played.length, 1);
  h.close();
});
test("unsupported browser cannot enable speech; unmount stops active playback", () => {
  const player = new RadioAudio(); const stop = player.start(null); player.setEnabled(true); assert.equal(player.getSnapshot().enabled, false); stop();
  const h = harness(); h.enable(); h.observe([message("one"), message("two")]); h.close(); h.played[0].end();
  assert.equal(h.cancelled(), 1); assert.equal(h.played.length, 1);
});
test("runway designators and radio frequencies are spoken digit by digit", () => {
  assert.equal(aviationSpeech("Runway 06, Runway 24R, contact Tower on 118.70"), "Runway zero six, Runway two four right, contact Tower on one one eight decimal seven zero");
});

test("ILS and GPS display compactly while both current and historical messages speak their letters", () => {
  const legacy = "Japan Air 514, requesting I-L-S approach. Expect G-P-S approach runway 06.";
  const display = "Japan Air 514, requesting ILS approach. Expect GPS approach runway 06.";
  assert.equal(radioDisplayText(legacy), display);
  assert.equal(radioDisplayText(display), display);
  assert.equal(aviationSpeech(display, ["Japan Air 514"]), "Japan Air five one four, requesting I-L-S approach. Expect G-P-S approach Runway zero six.");
  assert.equal(aviationSpeech(legacy, ["Japan Air 514"]), aviationSpeech(display, ["Japan Air 514"]));
  assert.equal(radioDisplayText("G-ABCD, visual approach. X-ray."), "G-ABCD, visual approach. X-ray.");
});

test("staff requests received behind the pause screen are queued and spoken once on resume", () => {
  const h = harness("ground"); h.enable();
  const state = {...initialExercise(), pausedByStaff: true};
  h.player.observe(state, true, "ground", true);
  const request = message("staff-request", "ground", "pilot");
  const received = {...state, messages: [request]};
  h.player.observe(received, true, "ground", true); h.player.observe(received, true, "ground", true);
  assert.equal(h.played.length, 0);
  h.player.observe({...received, pausedByStaff: false}, true, "ground", false);
  assert.equal(h.played.length, 1); assert.match(h.played[0].text, /^Easy five seven one/);
  h.played[0].end(); h.player.observe(received, true, "ground", false); assert.equal(h.played.length, 1); h.close();
});

test("airline callsigns and radio quantities keep their correct spoken formats", () => {
  assert.equal(aviationSpeech("Speedbird 104, climb to 3000 feet. Wind 240 at 10. QNH 1001.", ["Speedbird 104"]), "Speedbird one zero four, climb to three thousand feet. Wind two four zero at one zero. Q-N-H one zero zero one.");
  assert.equal(aviationSpeech("American 001, follow Delta 64. American 0010.", ["American 001", "Delta 64"]), "American zero zero one, follow Delta six four. American 0010.");
  assert.equal(aviationSpeech("Air Test (104), ready.", ["Air Test (104)"]), "Air Test (one zero four), ready.");
});

test("alphanumeric flight identifiers retain the airline name and separate digits from phonetic suffixes", () => {
  assert.equal(aviationSpeech("Ryanair 7VK, follow Ryanair 4RP.", ["Ryanair 7VK", "Ryanair 4RP"]), "Ryanair seven Victor Kilo, follow Ryanair four Romeo Papa.");
  assert.equal(aviationSpeech("Easy A12B Heavy, ready.", ["Easy A12B Heavy"]), "Easy Alpha one two Bravo Heavy, ready.");
  assert.equal(aviationSpeech("KLM 001, Japan Air 514.", ["KLM 001", "Japan Air 514"]), "K-L-M zero zero one, Japan Air five one four.");
});

test("known initialisms share display and spoken spelling without spelling ordinary words", () => {
  for (const acronym of RADIO_INITIALISMS) {
    const spoken = acronym.split("").join("-");
    assert.equal(aviationSpeech(acronym), spoken);
    assert.equal(aviationSpeech(spoken), spoken);
    assert.equal(radioDisplayText(spoken), acronym);
    assert.equal(radioInitialismSpeech(acronym.toLowerCase(), " "), acronym.split("").join(" "));
  }
  assert.equal(aviationSpeech("ATIS, visual, gulfstream, G-ABCD."), "ATIS, visual, gulfstream, G-ABCD.");
});

test("registration callsigns use phonetic letters and individual digits", () => {
  for (const [callsign, spoken] of [["N714KG", "November seven one four Kilo Golf"], ["n04az", "November zero four Alpha Zulu"], ["G-ABCD", "Golf Alpha Bravo Charlie Delta"], ["VH-X9Z", "Victor Hotel X-ray nine Zulu"], ["9V-SAA", "nine Victor Sierra Alpha Alpha"]]) assert.equal(aviationSpeech(`${callsign}, ready, ${callsign}.`, [callsign]), `${spoken}, ready, ${spoken}.`);
});

test("live transmissions, referenced traffic and replay all normalize callsigns without changing the message log", () => {
  const h = harness();
  const state = initialExercise(); state.aircraft[0].callsign = "Speedbird 104"; state.aircraft[1].callsign = "N714KG";
  h.player.observe(state, true, "all");
  const controller = {...message("callsign-controller"), text: "Speedbird 104, follow N714KG, Runway 24. Contact Tower on 118.70."};
  const pilot = {...message("callsign-pilot", "ground", "pilot"), text: "Following N714KG, Speedbird 104."};
  h.player.observe({...state, messages: [controller, pilot]}, true, "all");
  assert.equal(h.played[0].text, "Speedbird one zero four, follow November seven one four Kilo Golf, Runway two four. Contact Tower on one one eight decimal seven zero.");
  h.played[0].end(); assert.equal(h.played[1].text, "Following November seven one four Kilo Golf, Speedbird one zero four.");
  h.played[1].end(); h.player.say(pilot.text); assert.equal(h.played[2].text, h.played[1].text);
  assert.equal(pilot.text, "Following N714KG, Speedbird 104.");
  h.close();
});


test("the browser receives explicit spoken callsigns for transmissions and manual replay", () => {
  const windowBefore = Object.getOwnPropertyDescriptor(globalThis, "window");
  const utteranceBefore = Object.getOwnPropertyDescriptor(globalThis, "SpeechSynthesisUtterance");
  const spoken: {text: string; onend?: () => void}[] = [];
  class Utterance {constructor(public text: string) {}}
  Object.defineProperty(globalThis, "SpeechSynthesisUtterance", {configurable: true, value: Utterance});
  Object.defineProperty(globalThis, "window", {configurable: true, value: {SpeechSynthesisUtterance: Utterance, speechSynthesis: {
    getVoices: () => [{voiceURI: "local", name: "Local English", lang: "en-GB", localService: true}],
    addEventListener: () => {}, removeEventListener: () => {}, cancel: () => {}, speak: (utterance: {text: string}) => spoken.push(utterance),
  }}});
  try {
    const player = immediatePlayer(), close = player.start(browserSpeechOutput());
    try {
      const state = initialExercise(); state.aircraft[0].callsign = "N714KG"; state.aircraft[1].callsign = "Speedbird 104";
      player.observe(state, true, "all");
      const request = {...message("browser-callsign", "tower", "pilot"), text: "N714KG, following Speedbird 104."};
      player.observe({...state, messages: [request]}, true, "all");
      assert.equal(spoken[0].text, "November seven one four Kilo Golf, following Speedbird one zero four.");
      spoken[0].onend!(); player.say(request.text); assert.equal(spoken[1].text, spoken[0].text);
    } finally {close();}
  } finally {
    if (windowBefore) Object.defineProperty(globalThis, "window", windowBefore); else Reflect.deleteProperty(globalThis, "window");
    if (utteranceBefore) Object.defineProperty(globalThis, "SpeechSynthesisUtterance", utteranceBefore); else Reflect.deleteProperty(globalThis, "SpeechSynthesisUtterance");
  }
});


test("split radio hears only its tuned channel and monitoring changes never replay backlog", () => {
  const h = harness("ground"), exercise = {...initialExercise(), positions: [{id: "initial", name: "Initial", service: "approach" as const, facilityId: "first", mhz: "118.47"}]};
  h.player.observe(exercise, true, "approach", false, "initial");
  const wrong = {...message("other", "tower"), positionId: "final"}, right = {...message("own", "approach"), positionId: "initial"};
  h.player.observe({...exercise, messages: [wrong, right]}, true, "approach", false, "initial");
  assert.equal(h.played.length, 1); assert.match(h.played[0].text, /own/);
  h.player.observe({...exercise, messages: [wrong, right]}, true, "all", false, "all");
  assert.equal(h.played.length, 1, "switching monitoring cancels the old queue and baselines history");
  h.player.observe({...exercise, messages: [wrong, right, message("new", "tower")]}, true, "all", false, "all");
  assert.equal(h.played.length, 2); assert.match(h.played[1].text, /new/); h.close();
});

 test("older descent messages omit the arrival transition in display", () => {
  assert.equal(radioDisplayText("Pilot, descending via RUBUC3 · 22S arrival"), "Pilot, descending via RUBUC3 arrival");
  assert.equal(radioDisplayText("RUBUC3 · 22S is the selected route"), "RUBUC3 · 22S is the selected route");
});
