import type {DemoBatch, DemoController, DemoState} from "../demonstration";

/** One frame of the trainer's activity as stored for replays: exercise time plus the batch. */
export interface DemoTraceEntry {elapsed: number; batch: Omit<DemoBatch, "seq">}
interface Channel {
  seq: number; state?: DemoState; batches: DemoBatch[];
  seedSeq: number; seed?: DemoController;
  listeners: Set<() => void>;
  seats: Map<string, {role: string; until: number}>;
  active: boolean; trace: DemoTraceEntry[]; touched: number;
}
const TRUST_MS = 5_000, KEEP_BATCHES = 32, KEEP_TRACE = 600, IDLE_MS = 10 * 60_000;

/** In-process relay for demonstration mirrors. Nothing here is persisted except the replay trace the
 * caller drains; each app runs as one server process, so streams and posts meet in this map. */
export class DemoHub {
  private channels = new Map<string, Channel>();
  constructor(private now = Date.now) {}
  private channel(id: string) {
    let channel = this.channels.get(id);
    if (!channel) {
      channel = {seq: 0, batches: [], seedSeq: 0, listeners: new Set(), seats: new Map(), active: false, trace: [], touched: this.now()};
      this.channels.set(id, channel);
      const now = this.now();
      for (const [key, other] of this.channels) if (!other.listeners.size && now - other.touched > IDLE_MS) this.channels.delete(key);
    }
    channel.touched = this.now();
    return channel;
  }
  private notify(channel: Channel) {for (const listener of [...channel.listeners]) listener();}
  /** Called after each authorised stream frame: the seat token may post for a few seconds. Spectators'
   * frames are unlocked reads that can lag, so they leave `active` (undefined) to the seated pages. */
  trust(id: string, role: string, token: string, active: boolean | undefined) {
    const channel = this.channel(id);
    channel.seats.set(token, {role, until: this.now() + TRUST_MS});
    if (active === undefined) return;
    if (channel.active && !active) {channel.state = undefined; channel.seed = undefined; channel.batches = [];}
    channel.active = active;
  }
  allowed(id: string, role: string, token: string) {
    const channel = this.channels.get(id), seat = channel?.seats.get(token);
    return !!channel?.active && !!seat && seat.role === role && seat.until > this.now();
  }
  publish(id: string, batch: DemoBatch) {
    const channel = this.channel(id);
    const stored = {...batch, seq: ++channel.seq};
    if (batch.state) channel.state = batch.state;
    channel.batches.push(stored);
    if (channel.batches.length > KEEP_BATCHES) channel.batches.splice(0, channel.batches.length - KEEP_BATCHES);
    const {seq: _seq, ...entry} = batch;
    channel.trace.push({elapsed: batch.elapsed, batch: entry});
    if (channel.trace.length > KEEP_TRACE) channel.trace.splice(0, channel.trace.length - KEEP_TRACE);
    this.notify(channel);
  }
  /** The trainee's controller state when the trainer takes over. */
  seed(id: string, controller: DemoController) {
    const channel = this.channel(id);
    channel.seed = controller; channel.seedSeq = channel.seq + 1; channel.seq++;
    this.notify(channel);
  }
  /** Batches newer than `after`, with the latest full state so a late or lagging stream catches up. */
  read(id: string, after: number) {
    const channel = this.channels.get(id);
    if (!channel?.active || channel.seq <= after) return null;
    const batches = channel.batches.filter(batch => batch.seq > after);
    return {seq: channel.seq, state: channel.state, batches};
  }
  /** What the trainer's screen should start from: the trainee's seed, or the newer mirrored state. */
  readSeed(id: string, after: number): {seq: number; controller: DemoController} | null {
    const channel = this.channels.get(id);
    if (!channel?.active || channel.seq <= after) return null;
    const stateSeq = channel.batches.findLast(batch => batch.state)?.seq ?? 0;
    if (channel.seed && channel.seedSeq > after && channel.seedSeq >= stateSeq) return {seq: channel.seq, controller: channel.seed};
    if (after === 0 && channel.state) {
      const {frequency, selectedId, messageId, menuPath, dismissedStrips} = channel.state;
      return {seq: channel.seq, controller: {frequency, selectedId, messageId, menuPath, dismissedStrips}};
    }
    return null;
  }
  subscribe(id: string, listener: () => void) {
    const channel = this.channel(id);
    channel.listeners.add(listener);
    return () => {channel.listeners.delete(listener);};
  }
  drainTrace(id: string) {
    const channel = this.channels.get(id);
    if (!channel?.trace.length) return [];
    const trace = channel.trace; channel.trace = [];
    return trace;
  }
}
const shared = globalThis as typeof globalThis & {sweatboxDemoHub?: DemoHub};
export const demoHub = shared.sweatboxDemoHub ??= new DemoHub();
