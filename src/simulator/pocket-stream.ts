/** Parse length-prefixed little-endian PCM16 from the private Pocket service. */
export class PocketStreamDecoder {
  private buffer = new Uint8Array(4096);
  private read = 0;
  private write = 0;
  private total = 0;
  private complete = false;
  constructor(private readonly maximumBytes = 16 * 1024 * 1024) {}

  push(chunk: Uint8Array): Float32Array[] {
    if (this.complete && chunk.length) throw new Error("Data after speech completion");
    const pending = this.write - this.read, required = pending + chunk.length;
    if (required > this.maximumBytes + 4) throw new Error("Speech stream too large");
    if (this.buffer.length < required) {
      const grown = new Uint8Array(Math.min(this.maximumBytes + 4, Math.max(required, this.buffer.length * 2)));
      grown.set(this.buffer.subarray(this.read, this.write)); this.buffer = grown;
      this.read = 0; this.write = pending;
    } else if (this.buffer.length - this.write < chunk.length) {
      this.buffer.copyWithin(0, this.read, this.write); this.read = 0; this.write = pending;
    }
    this.buffer.set(chunk, this.write); this.write += chunk.length;
    const joined = this.buffer.subarray(0, this.write);
    let offset = this.read;
    const output: Float32Array[] = [];
    while (joined.length - offset >= 4) {
      const length = new DataView(joined.buffer, offset, 4).getUint32(0, false);
      if (length === 0) {
        if (!this.total || joined.length !== offset + 4) throw new Error("Invalid speech completion");
        this.complete = true; offset += 4; break;
      }
      if (length % 2 || length > this.maximumBytes || this.total + length > this.maximumBytes) throw new Error("Invalid speech frame");
      if (joined.length - offset - 4 < length) break;
      const view = new DataView(joined.buffer, offset + 4, length);
      const samples = new Float32Array(length / 2);
      for (let index = 0; index < samples.length; index++) samples[index] = view.getInt16(index * 2, true) / 32768;
      output.push(samples); this.total += length; offset += length + 4;
    }
    this.read = offset;
    if (this.read === this.write) this.read = this.write = 0;
    return output;
  }

  finish() {
    if (!this.complete || this.write !== this.read) throw new Error("Incomplete speech stream");
  }
}
