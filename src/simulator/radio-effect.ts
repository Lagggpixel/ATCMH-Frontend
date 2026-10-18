/** The same radio treatment as the approved samples, applied to generated PCM. */
export function radioEffect(input: Float32Array, sampleRate: number): Float32Array {
  if (!input.length || !Number.isFinite(sampleRate) || sampleRate < 8000) throw new Error("Invalid speech audio");
  let peak = 0;
  for (const sample of input) {
    if (!Number.isFinite(sample)) throw new Error("Invalid speech audio");
    peak = Math.max(peak, Math.abs(sample));
  }
  if (peak < .001) throw new Error("Empty speech audio");
  const normalized = input.map(sample => sample * .86 / peak);
  const filter = (samples: Float32Array, highpass: boolean, frequency: number) => {
    const w = 2 * Math.PI * frequency / sampleRate, c = Math.cos(w), a = Math.sin(w) / (2 * .7071);
    const b0 = (1 + (highpass ? c : -c)) / 2, b1 = highpass ? -(1 + c) : 1 - c;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    return samples.map(x => {
      const y = (b0 * x + b1 * x1 + b0 * x2 + 2 * c * y1 - (1 - a) * y2) / (1 + a);
      x2 = x1; x1 = x; y2 = y1; y1 = y;
      return y;
    });
  };
  const band = filter(filter(normalized, true, 350), false, 3200);
  const burstLength = Math.round(sampleRate * .07);
  const output = new Float32Array(band.length + burstLength * 2);
  let random = 19327;
  const noise = () => {random = (Math.imul(random, 1664525) + 1013904223) >>> 0; return random / 2147483648 - 1;};
  for (let i = 0; i < band.length; i++) {
    const fade = Math.min(1, i / 180, (band.length - i - 1) / 180);
    output[burstLength + i] = (Math.tanh(band[i] * 2.6) * .68 + noise() * .007) * fade;
  }
  for (let i = 0; i < burstLength; i++) {
    const burst = noise() * .065 * Math.sin(Math.PI * i / burstLength);
    output[i] = burst; output[burstLength + band.length + i] = burst;
  }
  peak = 0;
  for (const sample of output) peak = Math.max(peak, Math.abs(sample));
  return output.map(sample => sample * .86 / peak);
}
