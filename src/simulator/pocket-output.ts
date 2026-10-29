import type {RadioVoice, SpeechOutput, VoiceSettings} from "./radio-audio";
import {PocketStreamDecoder} from "./pocket-stream";

const voices: RadioVoice[] = [
  {id: "pocket:alba", name: "Alba", language: "en-GB", local: true},
  {id: "pocket:george", name: "George", language: "en-GB", local: true},
  {id: "pocket:jane", name: "Jane", language: "en-GB", local: true},
];
const voiceFor = (id: string) => voices.find(item => item.id === id)?.id.slice(7) ?? "alba";

export interface PocketPlayback {
  activate(): void;
  begin(settings: VoiceSettings): void;
  append(samples: Float32Array): void;
  finish(): Promise<void>;
  cancel(): void;
  dispose(): void;
}
export type PocketLoader = (text: string, voice: string, signal: AbortSignal) => Promise<ReadableStream<Uint8Array>>;

export function createPocketSpeechOutput(load: PocketLoader, playback: PocketPlayback): SpeechOutput {
  let serial = 0, controller: AbortController | undefined, disposed = false;
  let status: (text: string) => void = () => {};
  const cancel = () => {serial++; controller?.abort(); controller = undefined; playback.cancel(); status("");};
  return {
    voices: () => voices,
    onVoicesChanged: () => () => {},
    onStatusChanged: listener => {status = listener; return () => {status = () => {};};},
    activate: () => {if (!disposed) playback.activate();},
    speak(text, settings, end, error) {
      cancel(); const current = serial; const abort = new AbortController(); controller = abort;
      let received = false;
      status("Preparing radio voice…");
      void (async () => {
        if (disposed) throw new Error("Radio voice disposed");
        playback.begin(settings);
        const stream = await load(text, voiceFor(settings.voice), abort.signal);
        const reader = stream.getReader(), decoder = new PocketStreamDecoder();
        try {
          if (current !== serial) {await reader.cancel(); return;}
          for (;;) {
            const {value, done} = await reader.read();
            if (done) break;
            if (current !== serial) {await reader.cancel(); return;}
            for (const samples of decoder.push(value)) {
              playback.append(samples);
              if (!received) {received = true; status("Radio voice");}
            }
          }
          decoder.finish();
        } catch (reason) {await reader.cancel().catch(() => {}); throw reason;}
        if (current !== serial) return;
        await playback.finish();
        if (current === serial) {controller = undefined; status(""); end();}
      })().catch(reason => {
        if (current !== serial) return;
        controller = undefined; playback.cancel();
        if (received) {status("Radio voice interrupted; see the message log."); end();}
        else error(reason);
      });
    },
    cancel,
    dispose: () => {disposed = true; cancel(); playback.dispose();},
  };
}

function browserPocketPlayback(): PocketPlayback {
  let context: AudioContext | undefined, gain: GainNode | undefined, filter: BiquadFilterNode | undefined;
  const sources = new Set<AudioBufferSourceNode>();
  let next = 0, current = 0, rate = 1;
  const cancel = () => {current++; for (const source of sources) {try {source.stop();} catch { /* Already stopped. */ }} sources.clear(); gain?.disconnect(); filter?.disconnect(); gain = undefined; filter = undefined; next = 0;};
  return {
    activate() {
      context ??= new AudioContext();
      if (context.state !== "running") void context.resume().catch(() => {});
    },
    begin(settings) {
      if (!context || context.state !== "running") throw new DOMException("Audio needs a user gesture", "NotAllowedError");
      cancel(); rate = settings.rate;
      gain = context.createGain(); gain.gain.value = settings.volume;
      if (settings.radioFilter) {filter = context.createBiquadFilter(); filter.type = "bandpass"; filter.frequency.value = 1600; filter.Q.value = .5; filter.connect(gain);}
      gain.connect(context.destination); next = context.currentTime + .08;
    },
    append(samples) {
      if (!context || !gain) throw new Error("Radio playback unavailable");
      const buffer = context.createBuffer(1, samples.length, 24000);
      buffer.copyToChannel(samples, 0);
      const source = context.createBufferSource(); source.buffer = buffer; source.playbackRate.value = rate;
      source.connect(filter ?? gain); sources.add(source);
      source.onended = () => {sources.delete(source); source.disconnect();};
      const start = Math.max(next, context.currentTime + .01);
      source.start(start); next = start + samples.length / 24000 / rate;
    },
    async finish() {
      if (!context) throw new Error("Radio playback unavailable");
      const id = current;
      const deadline = Date.now() + Math.max(0, next - context.currentTime) * 1000 + 15_000;
      while (sources.size && id === current) {
        if (Date.now() > deadline) throw new Error("Radio playback stalled");
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      if (id === current) cancel();
    },
    cancel,
    dispose() {cancel(); if (context) void context.close().catch(() => {}); context = undefined;},
  };
}

export function browserPocketSpeechOutput(csrf: string): SpeechOutput | null {
  if (typeof window === "undefined" || typeof AudioContext === "undefined") return null;
  return createPocketSpeechOutput(async (text, voice, signal) => {
    const response = await fetch("/api/simulator/pocket-speech", {method: "POST", headers: {"content-type": "application/json", "x-csrf-token": csrf},
      body: JSON.stringify({text, voice, priority: "play"}), signal, cache: "no-store"});
    if (!response.ok || response.headers.get("content-type") !== "application/vnd.atcmh.pcm-stream" || !response.body) throw new Error("Radio voice unavailable");
    return response.body;
  }, browserPocketPlayback());
}
