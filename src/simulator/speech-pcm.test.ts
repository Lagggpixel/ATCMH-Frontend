import assert from "node:assert/strict";
import test from "node:test";
import {joinSpeechClips, trimSpeechClip, compactSpeechPauses} from "./speech-pcm";
const rate = 24000;
const sound = Float32Array.from({length: 2400}, (_, i) => Math.sin(i / 5) * .5);
function padded() {const clip = new Float32Array(7200); clip.set(sound, 2400); return clip;}

test("clip joins remove repeated silence envelopes while preserving voiced samples and clause pauses", () => {
  const original = padded(), trimmed = trimSpeechClip(original, rate);
  assert.ok(trimmed.length < original.length - 3500);
  assert.ok(trimmed.includes(sound[100]), "speech remains audible");
  const joined = joinSpeechClips([{samples: original, pause: 0}, {samples: original, pause: .045}, {samples: original, pause: .12}], rate);
  assert.equal(joined.length, trimmed.length * 3 - 96 + Math.round(.165 * rate));
  assert.ok(joined.every(value => Number.isFinite(value) && Math.abs(value) <= .5));
  assert.deepEqual(original, padded(), "cached clips are never mutated by trimming/crossfades");
  assert.deepEqual(joinSpeechClips([], rate), new Float32Array());
});

test("whole-message TTS bounds long silent gaps without changing the voiced words", () => {
  const samples = new Float32Array(sound.length * 2 + rate); samples.set(sound); samples.set(sound, sound.length + rate);
  const joined = compactSpeechPauses(samples, rate);
  assert.equal(joined.length, sound.length * 2 + rate * .12, "long silence is capped at 120 ms including the consonant guards");
  assert.deepEqual(joined.slice(0, sound.length), sound);
  assert.deepEqual(joined.slice(-sound.length), sound);
  const normal = new Float32Array(sound.length * 2 + 1200); normal.set(sound); normal.set(sound, sound.length + 1200);
  assert.deepEqual(compactSpeechPauses(normal, rate), normal, "normal short pauses are retained");
});

test("dense speech, silence and empty buffers remain finite and safe", () => {
  for (const samples of [sound, new Float32Array(0), new Float32Array(100)]) {
    assert.deepEqual(trimSpeechClip(samples, rate), samples);
    assert.ok(compactSpeechPauses(samples, rate).every(Number.isFinite));
  }
});
