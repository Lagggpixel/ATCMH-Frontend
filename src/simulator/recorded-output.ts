import type {RadioVoice, SpeechOutput, VoiceSettings} from "./radio-audio";
import {radioEffect} from "./radio-effect";
import {radioDisplayText} from "./radio-text";
import {compactSpeechPauses, joinSpeechClips} from "./speech-pcm";

export const RECORDINGS = "/sweatbox/recordings-v1";
export const RECORDED_VOICES: RadioVoice[] = [
  {id: "recorded:bf_emma", name: "Emma · British female · prerecorded", language: "en-GB", local: true},
  {id: "recorded:bm_george", name: "George · British male · prerecorded", language: "en-GB", local: true},
  {id: "recorded:af_heart", name: "Heart · American female · prerecorded", language: "en-US", local: true},
];
const DIGITS = "zero one two three four five six seven eight nine".split(" ");
const LETTERS = "alpha bravo charlie delta echo foxtrot golf hotel india juliett kilo lima mike november oscar papa quebec romeo sierra tango uniform victor whiskey x ray yankee zulu".split(" ");
// X-ray is two recordings, keeping the NATO fallback independent of punctuation.
const PHONETIC = [...LETTERS.slice(0, 23), "x ray", "yankee", "zulu"];
export interface RecordingPart {key: string; pause: number}
export function recordingParts(text: string, vocabulary: ReadonlySet<string>): RecordingPart[] {
  // Initialism clips already say letter names; splitting I-L-S would trigger NATO fallback.
  const tokens = radioDisplayText(text).replace(/\bFL\s*(\d+)/gi, "flight level $1").replace(/(\d)\.(?=\d)/g, "$1 decimal ").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[’]/g, "'").match(/[a-z]+(?:'[a-z]+)?|\d|[.,;:!?]/g) ?? [];
  if (tokens.length > 4096) throw new Error("Radio message too long");
  const parts: RecordingPart[] = [];
  // Clips already contain a short silence envelope. Avoid adding another gap between words.
  const add = (key: string) => {parts.push({key, pause: 0});};
  for (let i = 0; i < tokens.length;) {
    const token = tokens[i];
    if (/^[.,;:!?]$/.test(token)) {if (parts.length) parts[parts.length - 1].pause = /[.!?]/.test(token) ? .12 : .045; i++; continue;}
    // Prefer complete prerecorded phrases for natural cadence.
    let found = false;
    for (let n = Math.min(8, tokens.length - i); n > 1; n--) {
      const phrase = tokens.slice(i, i + n).join(" ");
      if (vocabulary.has(phrase)) {add(phrase); i += n; found = true; break;}
    }
    if (found) continue;
    if (/^\d$/.test(token)) add(DIGITS[Number(token)]);
    else if (vocabulary.has(token)) add(token);
    else for (const letter of token.replace(/'/g, "")) for (const word of PHONETIC[letter.charCodeAt(0) - 97].split(" ")) add(word);
    i++;
  }
  return parts;
}

export interface RecordingPlayback {
  activate(): void;
  play(samples: Float32Array, sampleRate: number, settings: VoiceSettings): Promise<void>;
  cancel(): void;
  dispose(): void;
}
export interface RecordingLibrary {
  vocabulary(voice: string, signal: AbortSignal): Promise<ReadonlySet<string>>;
  clip(voice: string, key: string, signal: AbortSignal): Promise<Float32Array>;
}

export function createRecordedSpeechOutput(library: RecordingLibrary, playback: RecordingPlayback): SpeechOutput {
  let generation = 0, request: AbortController | undefined, disposed = false;
  let status: (value: string) => void = () => {};
  type Prepared = {key: string; controller: AbortController; samples: Promise<Float32Array>};
  let prepared: Prepared | undefined;
  let loading: Promise<Float32Array> | undefined;
  const voiceFor = (settings: VoiceSettings) => (RECORDED_VOICES.find(v => v.id === settings.voice) ?? RECORDED_VOICES[0]).id.slice(9);
  const keyFor = (text: string, settings: VoiceSettings) => `${voiceFor(settings)}:${text}`;
  const load = (text: string, settings: VoiceSettings, after?: Promise<Float32Array>): Prepared => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const samples = (async () => {
      // Foreground assets have priority; lookahead must not slow the first call.
      if (after) await after.catch(() => {});
      if (controller.signal.aborted) throw new Error("Cancelled radio preparation");
      timer = setTimeout(() => controller.abort(), 15_000);
      const voice = voiceFor(settings);
      const vocabulary = await library.vocabulary(voice, controller.signal);
      if (controller.signal.aborted) throw new Error("Radio library request timed out");
      const parts = recordingParts(text, vocabulary);
      if (!parts.length) throw new Error("No spoken radio text");
      const keys = [...new Set(parts.map(part => part.key))], clips = new Map<string, Float32Array>();
      let index = 0;
      await Promise.all(Array.from({length: Math.min(12, keys.length)}, async () => {
        while (index < keys.length) {
          const key = keys[index++];
          const clip = await library.clip(voice, key, controller.signal);
          clips.set(key, compactSpeechPauses(clip, 24000));
        }
      }));
      if (controller.signal.aborted) throw new Error("Radio clip request timed out");
      return radioEffect(joinSpeechClips(parts.map(part => ({samples: clips.get(part.key)!, pause: part.pause})), 24000), 24000);
    })().catch(error => {controller.abort(); throw error;}).finally(() => clearTimeout(timer));
    // A speculative failure is silent; playback reports it if this transmission is still needed.
    void samples.catch(() => {});
    return {key: keyFor(text, settings), controller, samples};
  };
  const cancelPlayback = () => {generation++; request?.abort(); request = undefined; loading = undefined; playback.cancel(); status("");};
  const cancel = () => {prepared?.controller.abort(); prepared = undefined; cancelPlayback();};
  return {
    voices: () => RECORDED_VOICES,
    onVoicesChanged: () => () => {},
    onStatusChanged: listener => {status = listener; return () => {status = () => {};};},
    activate: () => {if (!disposed) playback.activate();},
    prepare(text, settings) {
      if (disposed || prepared?.key === keyFor(text, settings)) return;
      prepared?.controller.abort();
      prepared = load(text, settings, loading);
    },
    speak(text, settings, end, error) {
      if (disposed) {error(); return;}
      const pending = prepared?.key === keyFor(text, settings) ? prepared : undefined;
      if (!pending) prepared?.controller.abort();
      prepared = undefined;
      cancelPlayback();
      const current = generation;
      const job = pending ?? load(text, settings);
      request = job.controller;
      loading = job.samples;
      const run = async () => {
        status("Loading prerecorded radio clips…");
        const samples = await job.samples;
        if (current !== generation) return;
        loading = undefined;
        status("Prerecorded radio voice");
        await playback.play(samples, 24000, settings);
        if (current === generation) {request = undefined; end();}
      };
      void run().catch(() => {
        if (current !== generation) return;
        job.controller.abort(); playback.cancel(); request = undefined;
        status("Radio clips could not play. Click or press a key to retry."); error();
      });
    },
    cancel,
    dispose: () => {disposed = true; cancel(); playback.dispose();},
  };
}

/** PCM WAV deliberately avoids speech APIs, workers, WASM and codec dependencies. */
export function decodeRecording(bytes: ArrayBuffer): Float32Array {
  const view = new DataView(bytes);
  const tag = (at: number) => String.fromCharCode(...new Uint8Array(bytes, at, 4));
  if (bytes.byteLength < 44 || tag(0) !== "RIFF" || tag(8) !== "WAVE" || tag(12) !== "fmt " || view.getUint32(16, true) !== 16 || view.getUint16(20, true) !== 1 || view.getUint16(22, true) !== 1 || view.getUint32(24, true) !== 24000 || view.getUint16(34, true) !== 16 || tag(36) !== "data" || view.getUint32(40, true) !== bytes.byteLength - 44 || (bytes.byteLength - 44) % 2) throw new Error("Invalid radio recording");
  const samples = new Float32Array((bytes.byteLength - 44) / 2);
  for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(44 + i * 2, true) / 32768;
  return samples;
}

function browserLibrary(): RecordingLibrary {
  type Manifest = {version: number; voices: Record<string, Record<string, string>>};
  let manifest: Manifest | undefined, cacheBytes = 0;
  const cache = new Map<string, Float32Array>();
  const load = async (signal: AbortSignal) => {
    if (!manifest) {
      const response = await fetch(`${RECORDINGS}/manifest.json`, {signal});
      if (!response.ok) throw new Error("Radio library unavailable");
      const result = await response.json() as Manifest;
      if (result.version !== 1 || !result.voices) throw new Error("Invalid radio library");
      manifest = result;
    }
    return manifest;
  };
  return {
    vocabulary: async (voice, signal) => new Set(Object.keys((await load(signal)).voices[voice] ?? {})),
    async clip(voice, key, signal) {
      const filename = (await load(signal)).voices[voice]?.[key];
      if (!filename || !/^(bf_emma|bm_george|af_heart)\/[a-f0-9]{20}\.wav$/.test(filename)) throw new Error("Missing radio clip");
      const cached = cache.get(filename); if (cached) return cached;
      const response = await fetch(`${RECORDINGS}/${filename}`, {signal});
      if (!response.ok) throw new Error("Radio clip unavailable");
      const samples = decodeRecording(await response.arrayBuffer());
      if (signal.aborted) throw new Error("Cancelled radio clip");
      while (cacheBytes + samples.byteLength > 12 * 1024 * 1024 && cache.size) {
        const oldest = cache.keys().next().value!; cacheBytes -= cache.get(oldest)!.byteLength; cache.delete(oldest);
      }
      if (samples.byteLength <= 12 * 1024 * 1024) {cache.set(filename, samples); cacheBytes += samples.byteLength;}
      return samples;
    },
  };
}

export function recordingWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const bytes = new ArrayBuffer(44 + samples.length * 2), view = new DataView(bytes);
  const tag = (offset: number, value: string) => {for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));};
  tag(0, "RIFF"); view.setUint32(4, bytes.byteLength - 8, true); tag(8, "WAVEfmt "); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); tag(36, "data"); view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), true);
  return bytes;
}

export function browserRecordingPlayback(): RecordingPlayback {
  const audio = new Audio(); audio.preload = "auto";
  let url: string | undefined, settle: (() => void) | undefined, unlocked = false, generation = 0;
  const cancel = () => {
    generation++; audio.onended = null; audio.onerror = null; audio.pause();
    audio.removeAttribute("src"); audio.load();
    if (url) {URL.revokeObjectURL(url); url = undefined;}
    settle?.(); settle = undefined;
  };
  return {
    activate() {
      if (unlocked || url) return;
      const current = generation;
      // Prime the same media element synchronously in the user's gesture.
      audio.src = "data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQIAAAAAAA==";
      void audio.play().then(() => {if (current === generation) unlocked = true;}).catch(() => {});
    },
    async play(samples, sampleRate, settings) {
      cancel(); const current = generation;
      url = URL.createObjectURL(new Blob([recordingWav(samples, sampleRate)], {type: "audio/wav"}));
      audio.src = url; audio.volume = settings.volume; audio.playbackRate = settings.rate; audio.preservesPitch = true;
      const finished = new Promise<void>((resolve, reject) => {settle = resolve; audio.onended = () => resolve(); audio.onerror = () => reject(new Error("Radio playback failed"));});
      // Attach the failure handler before play() can reject under autoplay policy.
      const playing = audio.play();
      try {await Promise.all([playing, finished]); if (current === generation) unlocked = true;}
      catch (error) {if (current === generation) unlocked = false; throw error;}
      finally {if (current === generation) cancel();}
    },
    cancel,
    dispose: cancel,
  };
}

export function browserRecordedSpeechOutput(): SpeechOutput | null {
  if (typeof window === "undefined" || typeof Audio === "undefined") return null;
  return createRecordedSpeechOutput(browserLibrary(), browserRecordingPlayback());
}
