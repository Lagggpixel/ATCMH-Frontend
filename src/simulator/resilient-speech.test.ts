import assert from "node:assert/strict";
import test from "node:test";
import {resilientSpeechOutput} from "./resilient-speech";
import type {SpeechOutput, VoiceSettings} from "./radio-audio";

const settings: VoiceSettings = {voice: "sentence:af_heart", rate: 1.15, volume: .8};
function harness() {
  let status: (text: string) => void = () => {}, cancelled = 0, ended = 0, errors = 0;
  const calls: {text: string; settings: VoiceSettings; end: () => void; error: (reason?: unknown) => void}[] = [];
  const local: typeof calls = [];
  const primary: SpeechOutput = {voices: () => [{id: "voice", name: "Voice", language: "en-US", local: true}], onVoicesChanged: () => () => {}, onStatusChanged: listener => {status = listener; return () => {};}, speak: (text, settings, end, error) => calls.push({text, settings, end, error}), cancel: () => {cancelled++;}};
  const fallback: SpeechOutput = {...primary, onStatusChanged: undefined, speak: (text, settings, end, error) => local.push({text, settings, end, error})};
  const output = resilientSpeechOutput(primary, fallback)!;
  const speak = (text = "whole radio sentence") => output.speak(text, settings, () => ended++, () => errors++);
  return {output, speak, calls, local, status: (text: string) => status(text), cancelled: () => cancelled, ended: () => ended, errors: () => errors};
}
test("a stalled generator falls back in 2.5 seconds, locally and without changing sentence order", t => {
  t.mock.timers.enable({apis: ["setTimeout"]}); const h = harness(); h.speak(); t.mock.timers.tick(2499);
  assert.equal(h.local.length, 0); t.mock.timers.tick(1);
  assert.equal(h.local.length, 1); assert.equal(h.local[0].text, "whole radio sentence"); assert.equal(h.local[0].settings.allowOnline, false); assert.equal(h.local[0].settings.voice, "");
  h.local[0].end(); assert.equal(h.ended(), 1); h.calls[0].end(); assert.equal(h.ended(), 1);
  h.speak("next"); assert.equal(h.calls.length, 1); assert.equal(h.local[1].text, "next"); h.output.dispose?.();
});

test("late primary callbacks cannot finish, cancel or duplicate an active backup transmission", t => {
  t.mock.timers.enable({apis: ["setTimeout"]}); const h = harness(); h.speak(); t.mock.timers.tick(2500);
  h.calls[0].end(); h.calls[0].error(); h.status("Radio voice");
  assert.equal(h.local.length, 1); assert.equal(h.ended(), 0); assert.equal(h.errors(), 0);
  h.local[0].end(); assert.equal(h.ended(), 1); h.output.dispose?.();
});

test("loading audio is still subject to the startup deadline", t => {
  t.mock.timers.enable({apis: ["setTimeout"]}); const h = harness(); h.speak();
  h.status("Preparing radio playback…"); t.mock.timers.tick(2500);
  assert.equal(h.local.length, 1); h.output.dispose?.();
});

test("prerecorded backup prepares the matching voice and works with no native device voices", () => {
  const prepared: VoiceSettings[] = [], played: VoiceSettings[] = [];
  const primary: SpeechOutput = {voices: () => [], onVoicesChanged: () => () => {}, cancel() {}, speak(_text, _settings, _end, error) {error();}};
  const fallback: SpeechOutput = {...primary, voices: () => [{id: "recorded:af_heart", name: "Heart", language: "en-US", local: true}],
    prepare(_text, settings) {prepared.push(settings);}, speak(_text, settings, end) {played.push(settings); end();}};
  const output = resilientSpeechOutput(primary, fallback)!; let ended = 0;
  output.prepare!("queued", settings); output.speak("queued", settings, () => ended++, () => assert.fail("Backup failed"));
  assert.equal(prepared[0].voice, "recorded:af_heart"); assert.deepEqual(played, prepared); assert.equal(ended, 1);
  output.dispose?.();
});
test("long playback is not cut off by the preparation deadline", t => {
  t.mock.timers.enable({apis: ["setTimeout"]}); const h = harness(); h.speak(); h.status("Radio voice"); t.mock.timers.tick(120000);
  assert.equal(h.local.length, 0); h.calls[0].end(); assert.equal(h.ended(), 1); h.output.dispose?.();
});
test("pause/cancel invalidates late completion and prevents fallback audio", t => {
  t.mock.timers.enable({apis: ["setTimeout"]}); const h = harness(); h.speak(); h.output.cancel(); t.mock.timers.tick(10000); h.calls[0].error();
  assert.equal(h.local.length, 0); assert.equal(h.errors(), 0); assert.equal(h.ended(), 0); h.output.dispose?.();
});
test("generation errors recover immediately while repeated fallback errors remain visible", () => {
  const h = harness(); h.speak(); h.calls[0].error(); assert.equal(h.local.length, 1); h.local[0].error(); assert.equal(h.errors(), 1); h.output.dispose?.();
});
test("a browser without the primary adapter retains its available local output", () => {
  assert.equal(resilientSpeechOutput(null, null), null);
});


test("a recovered generator is retried after cooldown instead of losing sentence voices for the tab", t => {
  let now = 1000; t.mock.method(Date, "now", () => now);
  const h = harness(); h.speak(); h.calls[0].error(); h.local[0].end();
  now = 2000; h.speak("during recovery"); assert.equal(h.calls.length, 1); h.local[1].end();
  now = 32000; h.speak("recovered"); assert.equal(h.calls.length, 2); assert.equal(h.calls[1].text, "recovered"); h.calls[1].end(); h.output.dispose?.();
});
test("an explicit voice change retries the selected generator immediately", () => {
  const h = harness(); h.speak(); h.calls[0].error(); h.local[0].end();
  h.output.speak("new voice", {...settings, voice: "sentence:bf_emma"}, () => {}, () => {});
  assert.equal(h.calls.length, 2); assert.equal(h.calls[1].settings.voice, "sentence:bf_emma"); h.output.dispose?.();
});

test("autoplay denial retries the same voice immediately after a gesture without a cooldown", () => {
  const h = harness(); h.speak();
  h.calls[0].error(new DOMException("Interaction required", "NotAllowedError"));
  assert.equal(h.local.length, 0); assert.equal(h.errors(), 1);
  h.output.activate?.(); h.speak(); assert.equal(h.calls.length, 2);
  h.calls[1].end(); assert.equal(h.ended(), 1); h.output.dispose?.();
});

test("an unavailable backup never imposes a cooldown on the only usable output", () => {
  const h = harness();
  const only = resilientSpeechOutput({voices: () => [], onVoicesChanged: () => () => {}, speak: (_text, _settings, _end, error) => {h.speak(); error();}, cancel() {}}, null)!;
  only.speak("first", settings, () => {}, () => {}); only.speak("retry", settings, () => {}, () => {});
  assert.equal(h.calls.length, 2); only.dispose?.(); h.output.dispose?.();
});

test("without a device backup, a slow Pocket voice stays selected on retry", t => {
  t.mock.timers.enable({apis: ["setTimeout"]});
  const selected: string[] = [];
  const primary: SpeechOutput = {voices: () => [], onVoicesChanged: () => () => {}, speak: (_text, value) => {selected.push(value.voice);}, cancel() {}};
  const output = resilientSpeechOutput(primary, null, 15000)!;
  let errors = 0;
  output.speak("first", settings, () => {}, () => errors++);
  t.mock.timers.tick(15000);
  assert.equal(errors, 1);
  output.speak("retry", settings, () => {}, () => errors++);
  assert.deepEqual(selected, [settings.voice, settings.voice]); output.dispose?.();
});
