/** Locate quiet clip envelopes with 5 ms RMS windows, retaining consonant tails. */
export function trimSpeechClip(samples: Float32Array, sampleRate: number): Float32Array {
  const window = Math.max(1, Math.round(sampleRate * .005));
  const energies: number[] = [];
  for (let i = 0; i < samples.length; i += window) {
    let sum = 0;
    for (let j = i; j < Math.min(i + window, samples.length); j++) sum += samples[j] ** 2;
    energies.push(Math.sqrt(sum / Math.min(window, samples.length - i)));
  }
  const peak = energies.reduce((max, value) => Math.max(max, value), 0);
  if (peak < .004) return samples;
  const threshold = Math.max(.002, peak * .04), guard = Math.round(sampleRate * .016);
  const first = energies.findIndex(value => value >= threshold);
  let last = energies.length - 1;
  while (last > first && energies[last] < threshold) last--;
  return samples.subarray(Math.max(0, first * window - guard), Math.min(samples.length, (last + 1) * window + guard));
}

/** Join words in one buffer; only punctuation inserts a pause. Crossfade quiet edges to avoid clicks. */
export function joinSpeechClips(parts: readonly {samples: Float32Array; pause: number}[], sampleRate: number): Float32Array {
  const clips = parts.map(part => ({...part, samples: trimSpeechClip(part.samples, sampleRate)}));
  const fades = clips.map((clip, i) => i && !clips[i - 1].pause ? Math.min(Math.round(sampleRate * .004), clip.samples.length, clips[i - 1].samples.length) : 0);
  const length = clips.reduce((sum, clip, i) => sum + clip.samples.length + Math.round(clip.pause * sampleRate) - fades[i], 0);
  const joined = new Float32Array(length); let offset = 0;
  clips.forEach((clip, i) => {
    const fade = fades[i]; offset -= fade;
    for (let j = 0; j < fade; j++) {
      const mix = (j + 1) / (fade + 1);
      joined[offset + j] = joined[offset + j] * (1 - mix) + clip.samples[j] * mix;
    }
    joined.set(clip.samples.subarray(fade), offset + fade);
    offset += clip.samples.length + Math.round(clip.pause * sampleRate);
  });
  return joined;
}

/** Whole-message TTS can insert long silent gaps even between spoken digits. Bound
 * those gaps at 120 ms, preserving all voiced windows and a 16 ms consonant guard. */
export function compactSpeechPauses(samples: Float32Array, sampleRate: number): Float32Array {
  const clip = trimSpeechClip(samples, sampleRate), window = Math.max(1, Math.round(sampleRate * .005));
  const guard = Math.round(sampleRate * .016), limit = Math.round(sampleRate * .12) - 2 * guard;
  const cuts: {start: number; end: number}[] = [];
  let quiet = -1;
  for (let i = 0; i <= clip.length; i += window) {
    let peak = 0;
    for (let j = i; j < Math.min(i + window, clip.length); j++) peak = Math.max(peak, Math.abs(clip[j]));
    if (i < clip.length && peak < .002) {if (quiet < 0) quiet = i;}
    else if (quiet >= 0) {
      if (i - quiet > limit + 2 * guard) cuts.push({start: quiet + guard + limit, end: i - guard});
      quiet = -1;
    }
  }
  if (!cuts.length) return clip;
  const result = new Float32Array(clip.length - cuts.reduce((sum, cut) => sum + cut.end - cut.start, 0));
  let start = 0, offset = 0;
  for (const cut of cuts) {result.set(clip.subarray(start, cut.start), offset); offset += cut.start - start; start = cut.end;}
  result.set(clip.subarray(start), offset);
  return result;
}
