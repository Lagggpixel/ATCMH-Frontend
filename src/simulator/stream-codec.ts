import type {Exercise} from "./model";
import {replayDelta} from "./replays";
import {applyDelta, ByteReader, ByteWriter, concatBytes, decodeReplayFrame, decodeValue, encodeReplayFrame, encodeValue, ValueCodec, ValueDecoder} from "./sweatbox-codec";

/** Live session stream in compact binary. Each connection sends only what changed since its own last packet,
 * so the radar environment and earlier radio messages cross the network once per connection. */
export const STREAM_HEADER = "x-simulator-stream";
export const STREAM_FORMAT = "compact-1";
export const STREAM_BINARY_TYPE = "application/x-sweatbox-stream";
/** Request bodies for commands, joins and demonstration batches. */
export const BODY_BINARY_TYPE = "application/x-sweatbox";
export const MOTION_KEYS = ["id", "revision", "elapsed", "aircraft", "running", "conflicts", "collisions", "terrainStatus", "interceptFeedback"] as const;
const EMPTY = {aircraft: []} as unknown as Exercise;

export type StreamMessage = {type: string; exercise?: Exercise; state?: Partial<Exercise>; [key: string]: unknown};
export class StreamEncoder {
  private sent: Exercise | null = null;
  /** A length-prefixed packet. A snapshot's exercise or a motion state is sent as a difference. */
  packet(message: StreamMessage) {
    const {exercise, state, ...meta} = message;
    const codec = new ValueCodec();
    codec.value(meta);
    let frame: Uint8Array | undefined;
    if (exercise || state) {
      const before = this.sent ?? EMPTY;
      // A private copy: live session objects can change in place after this packet.
      let next: Exercise;
      if (exercise) next = structuredClone(exercise);
      else {
        // The browser merges motion into its last exercise, keeping fields the motion leaves out.
        next = {...before};
        for (const key of MOTION_KEYS) if (state![key] !== undefined) Object.assign(next, {[key]: structuredClone(state![key])});
      }
      frame = encodeReplayFrame(before, {sequence: 0, at: 0, delta: replayDelta(before, next), interpolate: false}, {exact: true});
      this.sent = next;
    }
    const body = concatBytes([codec.w.finish(), new Uint8Array([frame ? 1 : 0]), ...(frame ? [frame] : [])]);
    const w = new ByteWriter(); w.varuint(body.length); w.bytes(body);
    return w.finish();
  }
}
export class StreamDecoder {
  private base: Exercise | null = null;
  private pending: Uint8Array = new Uint8Array(0);
  /** Feeds received bytes; returns the complete messages they finish, in the JSON stream's shape. */
  push(bytes: Uint8Array): StreamMessage[] {
    this.pending = this.pending.length ? concatBytes([this.pending, bytes]) : bytes;
    const messages: StreamMessage[] = [];
    for (;;) {
      const header = new ByteReader(this.pending);
      let length: number;
      try {length = header.varuint();} catch {break;}
      if (header.offset + length > this.pending.length) break;
      messages.push(this.message(this.pending.subarray(header.offset, header.offset + length)));
      this.pending = this.pending.subarray(header.offset + length);
    }
    if (this.pending.length > 16_000_000) throw new Error("Session stream packet is too large.");
    return messages;
  }
  private message(body: Uint8Array): StreamMessage {
    const r = new ByteReader(body), meta = new ValueDecoder(r).value() as StreamMessage;
    if (!meta || typeof meta !== "object" || typeof meta.type !== "string") throw new Error("Invalid session stream packet.");
    if (r.u8()) {
      const before = this.base ?? EMPTY, frame = decodeReplayFrame(r, before);
      this.base = applyDelta(before, frame.delta);
      if (meta.type === "snapshot") meta.exercise = this.base;
      else meta.state = Object.fromEntries(MOTION_KEYS.filter(key => this.base![key] !== undefined).map(key => [key, this.base![key]]));
    }
    if (!r.done) throw new Error("Invalid session stream packet.");
    return meta;
  }
}
export const encodeBody = (value: unknown) => encodeValue(value);
export function decodeBody(bytes: Uint8Array) {return decodeValue(bytes);}
