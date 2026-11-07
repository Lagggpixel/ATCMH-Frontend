import type {Exercise} from "./model";
import {applyReplayDelta, type ReplayDetail} from "./replays";
import {ByteReader, ByteWriter, decodeReplayFrame, encodeReplayFrame, ValueCodec, ValueDecoder} from "./sweatbox-codec";

/** A whole replay in one download: "SBXR", a version byte, then deflate-raw of the header and every frame. */
export const REPLAY_BINARY_TYPE = "application/x-sweatbox-replay";
const MAGIC = [0x53, 0x42, 0x58, 0x52], VERSION = 1;

/** Uncompressed body. `anchors` are the exact values the frames preserve, such as the airport elevation. */
export function encodeReplayBody(detail: ReplayDetail, anchors: readonly number[] = []) {
  const codec = new ValueCodec();
  codec.value({replay: detail.replay, initial: detail.initial, positionFeedback: detail.positionFeedback, feedbackPositions: detail.feedbackPositions});
  const w = codec.w;
  w.varuint(detail.frames.length);
  let state = detail.initial;
  for (const frame of detail.frames) {
    if (!state) throw new Error("A replay with frames needs its initial state");
    const bytes = encodeReplayFrame(state, frame, {anchors});
    w.varuint(bytes.length); w.bytes(bytes);
    state = applyReplayDelta(state, frame.delta);
  }
  return w.finish();
}
export function decodeReplayBody(body: Uint8Array): ReplayDetail {
  const r = new ByteReader(body), header = new ValueDecoder(r).value() as Omit<ReplayDetail, "frames" | "next">;
  const frames: ReplayDetail["frames"] = [];
  let state = header.initial as Exercise | null;
  for (let count = r.varuint(); count > 0; count--) {
    const length = r.varuint(), frameReader = new ByteReader(r.bytes(length));
    if (!state) throw new RangeError("Replay frames without an initial state");
    const frame = decodeReplayFrame(frameReader, state);
    frames.push(frame); state = applyReplayDelta(state, frame.delta);
  }
  if (!r.done) throw new RangeError("Trailing bytes after replay");
  return {replay: header.replay, initial: header.initial ?? null, frames, next: null,
    ...(header.positionFeedback ? {positionFeedback: header.positionFeedback} : {}), ...(header.feedbackPositions ? {feedbackPositions: header.feedbackPositions} : {})};
}
export function wrapReplay(compressedBody: Uint8Array) {
  const w = new ByteWriter(); for (const byte of MAGIC) w.u8(byte); w.u8(VERSION); w.bytes(compressedBody); return w.finish();
}
export function unwrapReplay(data: Uint8Array) {
  if (data.length < 5 || MAGIC.some((byte, i) => data[i] !== byte)) throw new Error("This replay download is damaged.");
  if (data[4] !== VERSION) throw new Error("This replay needs a newer page. Reload and try again.");
  return data.subarray(5);
}
/** Browser and Node both provide DecompressionStream. */
export async function inflateRaw(data: Uint8Array) {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
export async function readReplayDownload(response: Response) {
  return decodeReplayBody(await inflateRaw(unwrapReplay(new Uint8Array(await response.arrayBuffer()))));
}
