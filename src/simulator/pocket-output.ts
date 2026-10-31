import type {RadioVoice, SpeechOutput, VoiceSettings} from "./radio-audio";
import {PocketStreamDecoder} from "./pocket-stream";

const voices: RadioVoice[] = [
  {id: "pocket:alba", name: "Alba", language: "en-GB", local: true},
  {id: "pocket:george", name: "George", language: "en-GB", local: true},
  {id: "pocket:jane", name: "Jane", language: "en-GB", local: true},
];
const voiceFor = (id: string) => voices.find(item => item.id === id)?.id.slice(7) ?? "george";

export interface PocketPlayback {
  activate(): void;
  begin(settings: VoiceSettings): void | Promise<void>;
  append(samples: Float32Array): void;
  finish(): Promise<void>;
  cancel(): void;
  dispose(): void;
}
export type PocketLoader = (text: string, voice: string, signal: AbortSignal, priority: "play" | "prepare") => Promise<ReadableStream<Uint8Array>>;

export function createPocketSpeechOutput(load: PocketLoader, playback: PocketPlayback): SpeechOutput {
  interface Job {
    key: string; text: string; voice: string; controller: AbortController;
    priority: "play" | "prepare"; kind: "queue" | "draft" | "readback";
    chunks: Float32Array[]; started: boolean; done: boolean; error?: unknown;
    listeners: Set<() => void>;
  }
  let serial = 0, disposed = false, active = 0;
  const jobs = new Map<string, Job>();
  const MAX_CONCURRENT = 3, MAX_SPECULATIVE = 8;
  let status: (text: string) => void = () => {};
  const wake = (job: Job) => {for (const listener of job.listeners) listener(); job.listeners.clear();};
  const remove = (job: Job) => {job.controller.abort(); if (jobs.get(job.key) === job) jobs.delete(job.key); wake(job);};
  const trimSpeculative = () => {
    const speculative = [...jobs.values()].filter(item => item.kind !== "queue");
    while (speculative.length > MAX_SPECULATIVE) remove(speculative.shift()!);
  };
  const pump = () => {
    while (!disposed && active < MAX_CONCURRENT) {
      const pending = [...jobs.values()].filter(job => !job.started && !job.controller.signal.aborted);
      const job = pending.find(item => item.priority === "play") ?? pending.find(item => item.kind === "queue") ?? pending[0];
      if (!job) return;
      // Bound completed audio waiting behind a long transmission. The current
      // head can always start, and the limit is rechecked after each job.
      const buffered = [...jobs.values()].reduce((sum, item) => sum + item.chunks.reduce((bytes, chunk) => bytes + chunk.byteLength, 0), 0);
      if (buffered >= 16 * 1024 * 1024 && job.priority !== "play") return;
      job.started = true; active++;
      void (async () => {
        const reader = (await load(job.text, job.voice, job.controller.signal, job.priority)).getReader(), decoder = new PocketStreamDecoder();
        const abortReader = () => {void reader.cancel().catch(() => {});};
        job.controller.signal.addEventListener("abort", abortReader, {once: true});
        try {
          if (job.controller.signal.aborted) {await reader.cancel(); return;}
          for (;;) {
            const {value, done} = await reader.read();
            if (done) break;
            if (job.controller.signal.aborted) {await reader.cancel(); return;}
            job.chunks.push(...decoder.push(value)); wake(job);
          }
          decoder.finish();
        } catch (reason) {await reader.cancel().catch(() => {}); throw reason;}
        finally {job.controller.signal.removeEventListener("abort", abortReader);}
      })().catch(reason => {job.error = reason;}).finally(() => {job.done = true; active--; wake(job); pump();});
    }
  };
  const ensure = (text: string, settings: VoiceSettings, kind: Job["kind"], priority: Job["priority"] = "prepare") => {
    const voice = voiceFor(settings.voice), key = JSON.stringify([voice, text]);
    let job = jobs.get(key);
    // A failed speculative request must not retry on every incoming snapshot.
    // Retry once it reaches the head of the audible queue instead.
    if (job?.controller.signal.aborted || (job?.error && priority === "play")) {remove(job); job = undefined;}
    if (!job) {
      job = {key, text, voice, kind, priority, controller: new AbortController(), chunks: [], started: false, done: false, listeners: new Set()};
      jobs.set(key, job);
    } else {
      if (kind === "queue" || (kind === "readback" && job.kind === "draft")) job.kind = kind;
      if (priority === "play") job.priority = priority;
    }
    trimSpeculative();
    pump(); return job;
  };
  const cancel = () => {serial++; for (const job of jobs.values()) remove(job); playback.cancel(); status("");};
  return {
    voices: () => voices,
    onVoicesChanged: () => () => {},
    onStatusChanged: listener => {status = listener; return () => {status = () => {};};},
    activate: () => {if (!disposed) playback.activate();},
    prepare: (text, settings) => {if (!disposed) ensure(text, settings, "queue");},
    prepareDraft: (text, settings) => {if (!disposed) ensure(text, settings, "draft");},
    prepareReadback: (text, settings) => {if (!disposed) ensure(text, settings, "readback");},
    cancelDraft: () => {for (const job of jobs.values()) if (job.kind === "draft") remove(job);},
    speak(text, settings, end, error) {
      const current = ++serial;
      let received = false;
      status("Preparing radio voice…");
      void (async () => {
        if (disposed) throw new Error("Radio voice disposed");
        // Claim the head before later queue entries can occupy generation slots.
        const job = ensure(text, settings, "queue", "play");
        await playback.begin(settings);
        if (current !== serial) return;
        let index = 0;
        while (current === serial) {
          while (index < job.chunks.length) {
            playback.append(job.chunks[index++]);
            if (!received) {received = true; status("Radio voice");}
          }
          if (job.done || job.controller.signal.aborted) break;
          await new Promise<void>(resolve => job.listeners.add(resolve));
        }
        if (current !== serial) return;
        if (job.error || job.controller.signal.aborted) throw job.error ?? new Error("Radio generation cancelled");
        await playback.finish();
        if (current === serial) {job.kind = "readback"; trimSpeculative(); pump(); status(""); end();}
      })().catch(reason => {
        if (current !== serial) return;
        playback.cancel();
        if (received) {status("Radio voice interrupted; see the message log."); end();}
        else error(reason);
      });
    },
    cancel,
    dispose: () => {disposed = true; cancel(); playback.dispose();},
  };
}

function browserPocketPlayback(AudioContextClass: typeof AudioContext): PocketPlayback {
  let context: AudioContext | undefined, gain: GainNode | undefined, filter: BiquadFilterNode | undefined;
  let resuming: Promise<void> | undefined;
  let session: {type: string} | undefined, previousSessionType: string | undefined;
  const sources = new Set<AudioBufferSourceNode>();
  let next = 0, current = 0, rate = 1;
  const cancel = () => {current++; for (const source of sources) {try {source.stop();} catch { /* Already stopped. */ }} sources.clear(); gain?.disconnect(); filter?.disconnect(); gain = undefined; filter = undefined; next = 0;};
  return {
    activate() {
      // WebKit may otherwise silence Web Audio when the iPad is in silent mode.
      // Preserve a session already configured for a call or other playback.
      try {
        const candidate = (navigator as Navigator & {audioSession?: {type: string}}).audioSession;
        if (candidate && (candidate.type === "auto" || candidate.type === "ambient")) {
          previousSessionType ??= candidate.type; candidate.type = "playback"; session = candidate;
        }
      } catch { /* Audio session configuration is optional. */ }
      context ??= new AudioContextClass();
      if (context.state !== "running") {
        // Some iOS browsers leave a resume promise pending after a gesture that
        // did not unlock audio. Every later gesture must get its own attempt.
        const attempt = context.resume().catch(() => {});
        resuming = attempt;
        void attempt.finally(() => {if (resuming === attempt) resuming = undefined;});
        // Start a silent source synchronously inside the gesture as required by
        // older WebKit implementations of Web Audio activation.
        const unlock = context.createBufferSource();
        unlock.buffer = context.createBuffer(1, 1, 22050);
        unlock.connect(context.destination);
        unlock.onended = () => unlock.disconnect();
        unlock.start();
      }
    },
    async begin(settings) {
      if (resuming && context?.state !== "running") {
        let timer: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([resuming, new Promise<void>(resolve => {timer = setTimeout(resolve, 1000);})]).finally(() => clearTimeout(timer));
      }
      if (!context || context.state !== "running") throw new DOMException("Audio needs a user gesture", "NotAllowedError");
      cancel(); rate = settings.rate;
      gain = context.createGain(); gain.gain.value = settings.volume;
      if (settings.radioFilter) {filter = context.createBiquadFilter(); filter.type = "bandpass"; filter.frequency.value = 1600; filter.Q.value = .5; filter.connect(gain);}
      gain.connect(context.destination); next = context.currentTime + .08;
    },
    append(samples) {
      if (!context || !gain) throw new Error("Radio playback unavailable");
      const buffer = context.createBuffer(1, samples.length, 24000);
      buffer.getChannelData(0).set(samples);
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
    dispose() {
      cancel(); if (context) void context.close().catch(() => {}); context = undefined;
      try {if (session?.type === "playback" && previousSessionType) session.type = previousSessionType;} catch { /* Optional browser API. */ }
    },
  };
}

export function browserPocketSpeechOutput(csrf: string): SpeechOutput | null {
  if (typeof window === "undefined") return null;
  const AudioContextClass = typeof AudioContext !== "undefined" ? AudioContext : (window as Window & {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
  if (!AudioContextClass) return null;
  return createPocketSpeechOutput(async (text, voice, signal, priority) => {
    const response = await fetch("/api/simulator/pocket-speech", {method: "POST", headers: {"content-type": "application/json", "x-csrf-token": csrf},
      body: JSON.stringify({text, voice, priority}), signal, cache: "no-store"});
    if (!response.ok || response.headers.get("content-type") !== "application/vnd.atcmh.pcm-stream" || !response.body) throw new Error("Radio voice unavailable");
    return response.body;
  }, browserPocketPlayback(AudioContextClass));
}
