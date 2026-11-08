import assert from "node:assert/strict";
import test from "node:test";
import {PocketStreamDecoder} from "./pocket-stream";

test("decodes split headers and frames and requires explicit completion", () => {
  const decoder = new PocketStreamDecoder();
  const bytes = Uint8Array.from([0, 0, 0, 4, 0, 64, 0, 192, 0, 0, 0, 0]);
  assert.deepEqual(decoder.push(bytes.subarray(0, 2)), []);
  assert.deepEqual(decoder.push(bytes.subarray(2, 5)), []);
  assert.deepEqual([...decoder.push(bytes.subarray(5, 9))[0]], [0.5, -0.5]);
  assert.deepEqual(decoder.push(bytes.subarray(9)), []);
  decoder.finish();
  assert.throws(() => decoder.push(Uint8Array.of(1)), /after speech completion/);
});

test("rejects truncated, oversized, empty and malformed streams", () => {
  const truncated = new PocketStreamDecoder(); truncated.push(Uint8Array.of(0, 0, 0, 4, 0));
  assert.throws(() => truncated.finish(), /Incomplete/);
  assert.throws(() => new PocketStreamDecoder().push(Uint8Array.of(0, 0, 0, 0)), /completion/);
  assert.throws(() => new PocketStreamDecoder().push(Uint8Array.of(0, 0, 0, 3)), /frame/);
  assert.throws(() => new PocketStreamDecoder(2).push(Uint8Array.of(0, 0, 0, 4)), /frame/);
});

test("grows and compacts a fragmented stream without changing PCM or retaining consumed bytes", () => {
  const pcm = new Uint8Array(12000);
  new DataView(pcm.buffer).setInt16(11998, -16384, true);
  const stream = new Uint8Array(pcm.length + 16), view = new DataView(stream.buffer);
  view.setUint32(0, pcm.length); stream.set(pcm, 4);
  view.setUint32(pcm.length + 4, 4); view.setInt16(pcm.length + 8, 16384, true);
  const decoder = new PocketStreamDecoder(), decoded: Float32Array[] = [];
  for (let offset = 0; offset < stream.length; offset += 31) decoded.push(...decoder.push(stream.subarray(offset, offset + 31)));
  decoder.finish();
  assert.equal(decoded.length, 2); assert.equal(decoded[0].at(-1), -.5); assert.equal(decoded[1][0], .5);
});
