// Copied to public at build time. Model inference never runs on the radar thread.
const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
const base = new URL("./", import.meta.url);
const upstream = `https://huggingface.co/${MODEL}/resolve/main/`;
const assetFetch = globalThis.fetch.bind(globalThis);
// Kokoro's bundled model/voice loader uses Hub URLs. Map those fixed asset URLs
// to our pinned, self-hosted copies; forbid any unexpected off-origin request.
globalThis.fetch = (input, options) => {
  let url = new URL(input instanceof Request ? input.url : input, base);
  if (url.href.startsWith(upstream)) url = new URL(`model/${url.href.slice(upstream.length)}`, base);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return Promise.reject(new Error("Unexpected speech asset"));
  return assetFetch(url, options);
};
let model;
function load() {
  model ??= import("./kokoro.web.js").then(({KokoroTTS, env}) => {
    env.wasmPaths = new URL("runtime/", base).href;
    return KokoroTTS.from_pretrained(MODEL, {dtype: "q8", device: "wasm"});
  });
  return model;
}

/** Bound chunks below the model's phoneme limit, including long published ATIS. */
function chunks(text) {
  const parts = []; let current = "";
  for (const word of text.trim().split(/\s+/)) {
    if (word.length > 220) throw new Error("Speech word too long");
    if (current && current.length + word.length + 1 > 220) {parts.push(current); current = "";}
    current += (current ? " " : "") + word;
    if (/[.!?]$/.test(word)) {parts.push(current); current = "";}
  }
  if (current) parts.push(current);
  return parts;
}

self.onmessage = async ({data: {id, text, voice, speed}}) => {
  try {
    if (!["bf_emma", "bm_george", "af_heart"].includes(voice) || !Number.isFinite(speed) || speed < .7 || speed > 1.5 || typeof text !== "string" || !text.trim()) throw new Error("Invalid speech request");
    const tts = await load(), parts = [];
    let length = 0;
    for (const textPart of chunks(text)) {
      const audio = await tts.generate(textPart, {voice, speed});
      parts.push(audio.audio); length += audio.audio.length;
    }
    const samples = new Float32Array(length); let offset = 0;
    for (const part of parts) {samples.set(part, offset); offset += part.length;}
    self.postMessage({id, samples, sampleRate: 24000}, [samples.buffer]);
  } catch {
    // Do not log radio text, participant details or raw model errors.
    self.postMessage({id, error: true});
  }
};
