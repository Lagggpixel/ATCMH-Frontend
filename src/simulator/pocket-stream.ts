/** Parse length-prefixed little-endian PCM16 from the private Pocket service. */
export class PocketStreamDecoder {
  private pending = new Uint8Array(0);
  private total = 0;
  private complete = false;
  constructor(private readonly maximumBytes = 16 * 1024 * 1024) {}

  push(chunk: Uint8Array): Float32Array[] {
    if (this.complete && chunk.length) throw new Error("Data after speech completion");
    if (this.pending.length + chunk.length > this.maximumBytes + 4) throw new Error("Speech stream too large");
    const joined = new Uint8Array(this.pending.length + chunk.length);
    joined.set(this.pending); joined.set(chunk, this.pending.length);
    let offset = 0;
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
    this.pending = joined.slice(offset);
    return output;
  }

  finish() {
    if (!this.complete || this.pending.length) throw new Error("Incomplete speech stream");
  }
}
