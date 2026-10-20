import {browserSpeechOutput, type RadioVoice, type SpeechOutput, type VoiceSettings} from "./radio-audio";
import {radioEffect} from "./radio-effect";

// Version the asset path when changing the model, runtime or worker protocol.
export const KOKORO_ASSETS = "/sweatbox/speech/kokoro-v1";
export const KOKORO_VOICES: RadioVoice[] = [
  {id: "kokoro:bf_emma", name: "Kokoro Emma · British female", language: "en-GB", local: true},
  {id: "kokoro:bm_george", name: "Kokoro George · British male", language: "en-GB", local: true},
  {id: "kokoro:af_heart", name: "Kokoro Heart · American female", language: "en-US", local: true},
];
export interface SpeechClip {samples: Float32Array; sampleRate: number}
export interface KokoroSynthesis {
  generate(text: string, voice: string, speed: number): Promise<SpeechClip>;
  cancel(): void;
  dispose(): void;
}
export interface RadioPlayback {
  activate(): void;
  play(clip: SpeechClip, volume: number): Promise<void>;
  cancel(): void;
  dispose(): void;
}

/** AI failure is latched for this player, avoiding repeated waits on a broken device.
 * Only the existing browser adapter can select provider voices, with its existing consent. */
export function createKokoroSpeechOutput(fallback: SpeechOutput | null, createSynthesis: () => KokoroSynthesis, createPlayback: () => RadioPlayback): SpeechOutput {
  let synthesis: KokoroSynthesis | undefined, playback: RadioPlayback | undefined;
  let generation = 0, failed = false, disposed = false;
  let statusListener: (status: string) => void = () => {};
  const cache = new Map<string, SpeechClip>();
  let cacheBytes = 0;
  const cancel = () => {generation++; synthesis?.cancel(); playback?.cancel(); fallback?.cancel(); statusListener("");};
  return {
    voices: () => [...KOKORO_VOICES, ...(fallback?.voices() ?? []).map(voice => ({...voice, name: `Browser · ${voice.name}`}))],
    onVoicesChanged: listener => fallback?.onVoicesChanged(listener) ?? (() => {}),
    onStatusChanged: listener => {statusListener = listener; return () => {statusListener = () => {};};},
    activate: () => {
      if (disposed) return;
      try {playback ??= createPlayback(); playback.activate();} catch { /* speak can still use browser voices. */ }
    },
    speak(text, settings, end, error) {
      if (disposed) {error(); return;}
      const current = ++generation;
      const finish = (callback: () => void) => {if (current === generation) {generation++; callback();}};
      const browser = (automatic: boolean) => {
        if (current !== generation) return;
        statusListener(automatic ? "Kokoro unavailable; using a browser voice." : "Browser voice");
        if (!fallback) {finish(error); return;}
        // An AI voice ID must never be passed to the browser or implicitly select an online voice.
        const browserSettings: VoiceSettings = automatic ? {...settings, voice: ""} : settings;
        try {fallback.speak(text, browserSettings, () => finish(end), () => finish(error));} catch {finish(error);}
      };
      if (settings.voice && !settings.voice.startsWith("kokoro:")) {browser(false); return;}
      if (failed) {browser(true); return;}
      const voice = settings.voice || KOKORO_VOICES[0].id;
      if (!KOKORO_VOICES.some(item => item.id === voice)) {browser(true); return;}
      const key = JSON.stringify([voice, settings.rate, text]);
      const run = async () => {
        let clip = cache.get(key);
        if (!clip) {
          statusListener("Preparing Kokoro radio voice…");
          synthesis ??= createSynthesis();
          const generated = await synthesis.generate(text, voice.slice(7), settings.rate);
          if (current !== generation) return;
          clip = {samples: radioEffect(generated.samples, generated.sampleRate), sampleRate: generated.sampleRate};
          // PCM is tab-local and bounded; do not persist radio text or generated speech.
          if (clip.samples.byteLength <= 12 * 1024 * 1024) {
            while (cacheBytes + clip.samples.byteLength > 12 * 1024 * 1024 || cache.size >= 12) {
              const oldest = cache.keys().next().value!;
              cacheBytes -= cache.get(oldest)!.samples.byteLength; cache.delete(oldest);
            }
            cache.set(key, clip); cacheBytes += clip.samples.byteLength;
          }
        }
        if (current !== generation) return;
        statusListener("Kokoro radio voice");
        playback ??= createPlayback();
        await playback.play(clip, settings.volume);
        finish(end);
      };
      void run().catch(() => {
        if (current !== generation) return;
        failed = true; synthesis?.dispose(); synthesis = undefined;
        playback?.cancel(); browser(true);
      });
    },
    cancel,
    dispose: () => {disposed = true; cancel(); synthesis?.dispose(); playback?.dispose(); fallback?.dispose?.(); cache.clear(); cacheBytes = 0;},
  };
}

/** Dedicated worker: cancellation stops pending download/inference, while idle models stay warm. */
function browserSynthesis(): KokoroSynthesis {
  let worker: Worker | undefined, sequence = 0;
  let pending: {id: number; resolve: (clip: SpeechClip) => void; reject: () => void; timer: ReturnType<typeof setTimeout>} | undefined;
  const stop = () => {
    worker?.terminate(); worker = undefined;
    const request = pending; pending = undefined;
    if (request) {clearTimeout(request.timer); request.reject();}
  };
  return {
    generate(text, voice, speed) {
      return new Promise((resolve, reject) => {
        worker ??= new Worker(`${KOKORO_ASSETS}/worker.mjs`, {type: "module", name: "Kokoro radio"});
        const id = ++sequence;
        pending = {id, resolve, reject: () => reject(new Error("Kokoro unavailable")), timer: setTimeout(stop, 45_000)};
        worker.onerror = event => {event.preventDefault(); stop();};
        worker.onmessage = (event: MessageEvent<{id: number; samples?: Float32Array; sampleRate?: number; error?: boolean}>) => {
          if (event.data.id !== pending?.id) return;
          const request = pending!; pending = undefined; clearTimeout(request.timer);
          const {samples, sampleRate, error} = event.data;
          if (error || !(samples instanceof Float32Array) || sampleRate !== 24000 || !samples.length) {stop(); request.reject(); return;}
          request.resolve({samples, sampleRate});
        };
        worker.postMessage({id, text, voice, speed});
      });
    },
    cancel: () => {if (pending) stop();},
    dispose: stop,
  };
}

function browserRadioPlayback(): RadioPlayback {
  const context = new AudioContext();
  let source: AudioBufferSourceNode | undefined, gain: GainNode | undefined, generation = 0;
  let complete: (() => void) | undefined;
  const cancel = () => {
    generation++;
    if (source) {source.onended = null; source.stop(); source.disconnect(); source = undefined;}
    gain?.disconnect(); gain = undefined;
    complete?.(); complete = undefined;
  };
  return {
    activate: () => {void context.resume().catch(() => {});},
    async play(clip, volume) {
      const current = generation;
      await context.resume();
      if (current !== generation) return;
      if (context.state !== "running") throw new Error("Audio playback is blocked");
      const buffer = context.createBuffer(1, clip.samples.length, clip.sampleRate);
      buffer.getChannelData(0).set(clip.samples);
      source = context.createBufferSource(); source.buffer = buffer;
      gain = context.createGain(); gain.gain.value = Math.max(0, Math.min(1, volume));
      source.connect(gain); gain.connect(context.destination);
      await new Promise<void>(resolve => {
        complete = resolve;
        source!.onended = () => {source?.disconnect(); gain?.disconnect(); source = undefined; gain = undefined; complete = undefined; resolve();};
        source!.start();
      });
    },
    cancel,
    dispose: () => {cancel(); void context.close().catch(() => {});},
  };
}

export function browserRadioSpeechOutput(): SpeechOutput | null {
  const fallback = browserSpeechOutput();
  if (typeof window === "undefined" || !window.Worker || !window.AudioContext || !window.WebAssembly) return fallback;
  return createKokoroSpeechOutput(fallback, browserSynthesis, browserRadioPlayback);
}
