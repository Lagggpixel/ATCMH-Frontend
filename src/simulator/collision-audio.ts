import type {Exercise} from "./model";

export interface CollisionSound {activate(): void; play(volume: number): void; close(): void}

/** New authoritative events only. Reloads, reconnects and repeated snapshots
 * establish a baseline rather than replaying historical impacts. */
export class CollisionAudio {
  private previous?: {id: string; elapsed: number; connected: boolean};
  private seen = new Set<string>();
  constructor(private sound: CollisionSound) {}
  observe(exercise: Exercise, connected: boolean, enabled: boolean, paused: boolean, volume: number) {
    const previous = this.previous, events = exercise.collisions ?? [];
    const baseline = !previous || !previous.connected || !connected || previous.id !== exercise.id || exercise.elapsed < previous.elapsed;
    if (!baseline && enabled && !paused) for (const event of events) if (!this.seen.has(event.id)) this.sound.play(volume);
    this.seen = new Set(events.map(event => event.id));
    this.previous = {id: exercise.id, elapsed: exercise.elapsed, connected};
  }
}

/** A short local noise burst; no remote audio asset or speech-provider request. */
export function browserCollisionSound(): CollisionSound {
  let context: AudioContext | undefined;
  const activate = () => {
    if (typeof window === "undefined" || !window.AudioContext) return;
    context ??= new AudioContext();
    void context.resume().catch(() => {});
  };
  return {activate, play(volume) {
    if (!context || context.state !== "running") return;
    const buffer = context.createBuffer(1, Math.floor(context.sampleRate * .35), context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * Math.exp(-9 * i / samples.length);
    const source = context.createBufferSource(), gain = context.createGain(), filter = context.createBiquadFilter();
    source.buffer = buffer; filter.type = "lowpass"; filter.frequency.value = 900; gain.gain.value = Math.max(0, Math.min(1, volume));
    source.connect(filter); filter.connect(gain); gain.connect(context.destination); source.start();
    source.onended = () => {source.disconnect(); filter.disconnect(); gain.disconnect();};
  }, close() {void context?.close().catch(() => {}); context = undefined;}};
}
