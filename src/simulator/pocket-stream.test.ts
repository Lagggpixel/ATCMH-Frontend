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
