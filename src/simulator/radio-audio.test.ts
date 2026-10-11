import assert from "node:assert/strict";
import test from "node:test";
import {initialExercise} from "./engine";
import type {Exercise, Message} from "./model";
import {RadioAudio, aviationSpeech, browserSpeechOutput, type SpeechOutput, type VoiceSettings} from "./radio-audio";

const message = (id: string, frequency: Message["frequency"] = "ground", sender: Message["sender"] = "controller"): Message => ({id, frequency, sender, aircraftId: "demo-ground", time: 1, text: `Easy 571, taxi to Runway 24, hold short (${id})`});
function harness(scope: "all" | "ground" | "tower" = "all") {
  const played: {text: string; settings: VoiceSettings; end: () => void; error: () => void}[] = [];
  let cancelled = 0, voiceListener = () => {};
  const output: SpeechOutput = {
    voices: () => [{id: "local", name: "Local English", language: "en-GB", local: true}],
    onVoicesChanged: listener => {voiceListener = listener; return () => {voiceListener = () => {};};},
    speak: (text, settings, end, error) => {played.push({text, settings: {...settings}, end, error});},
    cancel: () => {cancelled++;},
  };
  const player = new RadioAudio();
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
  assert.equal(h.player.getSnapshot().voices[0].id, "local");
  assert.equal(h.played.length, 0); // Mounting does not produce an announcement.
  h.observe([message("fresh")]); assert.equal(h.played.length, 1);
  assert.equal(browserSpeechOutput(), null);
  h.close();
});
test("new controller and pilot transmissions play in order once across repeated snapshots", () => {
  const h = harness(); h.enable();
  const messages = [message("command"), message("readback", "ground", "pilot")];
  h.observe(messages); h.observe(messages);
  assert.equal(h.played.length, 1);
  assert.match(h.played[0].text, /Runway two four/);
  h.played[0].end(); assert.equal(h.played.length, 2);
  assert.match(h.played[1].text, /^Easy 571/);
  h.played[1].end(); h.observe(messages); assert.equal(h.played.length, 2);
  h.close();
});
test("muted messages and initial/recovered history never replay on enabling", () => {
  const h = harness(); h.player.setEnabled(false); h.observe([message("old")]); h.enable();
  h.observe([message("old")]); assert.equal(h.played.length, 0);
  h.observe([message("old")], false); h.observe([message("old"), message("while-offline")], true);
  assert.equal(h.played.length, 0);
  h.observe([message("old"), message("while-offline"), message("new")]); assert.equal(h.played.length, 1);
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
  h.observe([]); assert.equal(h.cancelled(), 2); h.close();
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

test("staff requests received behind the pause screen are queued and spoken once on resume", () => {
  const h = harness("ground"); h.enable();
  const state = {...initialExercise(), pausedByStaff: true};
  h.player.observe(state, true, "ground", true);
  const request = message("staff-request", "ground", "pilot");
  const received = {...state, messages: [request]};
  h.player.observe(received, true, "ground", true); h.player.observe(received, true, "ground", true);
  assert.equal(h.played.length, 0);
  h.player.observe({...received, pausedByStaff: false}, true, "ground", false);
  assert.equal(h.played.length, 1); assert.match(h.played[0].text, /^Easy 571/);
  h.played[0].end(); h.player.observe(received, true, "ground", false); assert.equal(h.played.length, 1); h.close();
});
