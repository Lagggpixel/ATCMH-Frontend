import type {SpeechOutput, VoiceSettings} from "./radio-audio";
import {browserRecordingPlayback, decodeRecording, type RecordingPlayback} from "./recorded-output";
import {MAX_SPEECH_BYTES, SENTENCE_VOICES, sentenceVoice} from "./sentence-audio";

export type SentenceLoader = (text: string, settings: VoiceSettings, signal: AbortSignal, priority: "play" | "prepare") => Promise<Float32Array>;

/** Complete transmissions are generated together. Only one queued call is prepared ahead. */
export function createSentenceSpeechOutput(loadSpeech: SentenceLoader, playback: RecordingPlayback, warm = () => {}): SpeechOutput {
  const cache = new Map<string, Float32Array>();
  type Pending = {controller: AbortController; promise: Promise<Float32Array>; spoken: boolean};
  const requests = new Map<string, Pending>();
  let bytes = 0, generation = 0, disposed = false, active = false, draftKey: string | undefined;
  let status: (value: string) => void = () => {};
  const keyFor = (text: string, settings: VoiceSettings) => JSON.stringify([sentenceVoice(settings.voice), Boolean(settings.radioFilter), text]);
  const load = (text: string, settings: VoiceSettings, priority: "play" | "prepare") => {
    const key = keyFor(text, settings), cached = cache.get(key);
    if (cached) return Promise.resolve(cached);
    const existing = requests.get(key);
    if (existing) {if (priority === "play") existing.spoken = true; return existing.promise;}
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    controller.signal.addEventListener("abort", () => clearTimeout(timer), {once: true});
    const request = {controller, spoken: priority === "play"} as Pending;
    request.promise = loadSpeech(text, settings, controller.signal, priority).then(samples => {
      if (controller.signal.aborted) throw new Error("Cancelled speech");
      if (!samples.length || samples.byteLength > MAX_SPEECH_BYTES * 2 || !samples.every(Number.isFinite)) throw new Error("Invalid speech audio");
      while (cache.size && (bytes + samples.byteLength > 12 * 1024 * 1024 || cache.size >= 12)) {
        const first = cache.keys().next().value!; bytes -= cache.get(first)!.byteLength; cache.delete(first);
      }
      if (samples.byteLength <= 12 * 1024 * 1024) {cache.set(key, samples); bytes += samples.byteLength;}
      return samples;
    }).finally(() => {clearTimeout(timer); if (requests.get(key) === request) requests.delete(key);});
    void request.promise.catch(() => {});
    requests.set(key, request); return request.promise;
  };
  const cancelDraft = () => {
    const request = draftKey ? requests.get(draftKey) : undefined;
    if (request && !request.spoken) {request.controller.abort(); requests.delete(draftKey!);}
    draftKey = undefined;
  };
  const cancel = () => {
    generation++; active = false; playback.cancel(); cancelDraft();
    requests.forEach(request => request.controller.abort()); requests.clear(); status("");
  };
  return {
    voices: () => SENTENCE_VOICES,
    onVoicesChanged: () => () => {},
    onStatusChanged: listener => {status = listener; return () => {status = () => {};};},
    activate: () => {if (!disposed) {warm(); playback.activate();}},
    prepare: (text, settings) => {if (!disposed) void load(text, settings, "prepare").catch(() => {});},
    prepareDraft(text, settings) {
      if (disposed) return;
      const key = keyFor(text, settings); if (draftKey !== key) cancelDraft(); draftKey = key;
      if (!active) status("Preparing radio voice…");
      void load(text, settings, "prepare").then(() => {if (!active && draftKey === key) status("Voice ready");}).catch(() => {if (!active && draftKey === key) status("");});
    },
    cancelDraft,
    warm,
    speak(text, settings, end, error) {
      generation++; const current = generation;
      // Let the gesture's primer finish while the first sentence loads on iOS.
      if (active) playback.cancel();
      if (disposed) {error(); return;}
      active = true; status("Preparing radio voice…");
      void (async () => {
        const samples = await load(text, settings, "play");
        if (current !== generation) return;
        status("Radio voice"); await playback.play(samples, 24000, settings);
        if (current === generation) {active = false; status(""); end();}
      })().catch(() => {if (current === generation) {active = false; playback.cancel(); error();}});
    },
    cancel,
    dispose: () => {disposed = true; cancel(); playback.dispose(); cache.clear(); bytes = 0;},
  };
}

export function browserSentenceSpeechOutput(csrf: string): SpeechOutput | null {
  if (typeof window === "undefined" || typeof Audio === "undefined") return null;
  let warmed = false, disposed = false;
  const warmController = new AbortController();
  const warm = () => {
    if (warmed || disposed) return; warmed = true;
    void fetch("/api/simulator/speech", {cache: "no-store", signal: warmController.signal}).catch(() => {warmed = false;});
  };
  const output = createSentenceSpeechOutput(async (text, settings, signal, priority) => {
    const response = await fetch("/api/simulator/speech", {method: "POST", headers: {"content-type": "application/json", "x-csrf-token": csrf},
      body: JSON.stringify({text, voice: sentenceVoice(settings.voice), filter: Boolean(settings.radioFilter), priority}), signal, cache: "no-store"});
    if (!response.ok || Number(response.headers.get("content-length") ?? 0) > MAX_SPEECH_BYTES) throw new Error("Radio voice unavailable");
    const reader = response.body?.getReader(); if (!reader) throw new Error("Missing radio audio");
    const chunks: Uint8Array[] = []; let length = 0;
    try {
      for (;;) {const {value, done} = await reader.read(); if (done) break; length += value.length; if (length > MAX_SPEECH_BYTES) throw new Error("Radio audio too large"); chunks.push(value);}
    } catch (error) {await reader.cancel(); throw error;}
    const audio = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) {audio.set(chunk, offset); offset += chunk.length;}
    return decodeRecording(audio.buffer);
  }, browserRecordingPlayback(), warm);
  const dispose = output.dispose!;
  output.dispose = () => {disposed = true; warmController.abort(); dispose();};
  return output;
}
