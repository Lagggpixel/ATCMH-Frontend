import {createHash} from "node:crypto";
import {copyFile, mkdir, readFile, rename, writeFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));
const output = path.join(root, "public/simulator/speech/kokoro-v1");
const revision = "1939ad2a8e416c0acfeecc08a694d14ef25f2231";
const files = [
  ["config.json", "df34b4f930b23447cd4dc410fabfb42eb3f24e803e6c3f97d618fb359380a36f"],
  ["tokenizer_config.json", "be1cb066d6ef6b074b3f15e6a6dd21ac88ff3cdaedf325f0aaed686c70f75d20"],
  ["tokenizer.json", "77a02c8e164413299b4b4c403b14f8e0e1c1b727db4d46a09d6327b861060a34"],
  ["onnx/model_quantized.onnx", "fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478"],
];
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
await mkdir(output, {recursive: true});
for (const [name, hash] of files) {
  const target = path.join(output, "model", name);
  let existing;
  try {existing = await readFile(target);} catch { /* First build downloads the pinned asset. */ }
  if (existing && sha256(existing) === hash) continue;
  console.log(`Preparing Kokoro ${name}`);
  const response = await fetch(`https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/${revision}/${name}`, {signal: AbortSignal.timeout(180_000)});
  if (!response.ok) throw new Error(`Speech asset download failed: ${name} (${response.status})`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (sha256(bytes) !== hash) throw new Error(`Speech asset checksum failed: ${name}`);
  await mkdir(path.dirname(target), {recursive: true});
  await writeFile(`${target}.tmp`, bytes); await rename(`${target}.tmp`, target);
}
async function copy(source, destination) {
  const target = path.join(output, destination);
  await mkdir(path.dirname(target), {recursive: true});
  await copyFile(path.join(root, source), target);
}
const kokoro = JSON.parse(await readFile(path.join(root, "node_modules/kokoro-js/package.json"), "utf8"));
const runtime = JSON.parse(await readFile(path.join(root, "node_modules/onnxruntime-web/package.json"), "utf8"));
if (kokoro.version !== "1.2.1" || runtime.version !== "1.22.0-dev.20250409-89f8206ba4") throw new Error("Revalidate speech runtime assets before changing their versions");
await copy("node_modules/kokoro-js/dist/kokoro.web.js", "kokoro.web.js");
await copy("src/simulator/kokoro-worker.mjs", "worker.mjs");
for (const voice of ["bf_emma", "bm_george", "af_heart"]) await copy(`node_modules/kokoro-js/voices/${voice}.bin`, `model/voices/${voice}.bin`);
for (const file of ["ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.jsep.mjs", "ort-wasm-simd-threaded.jsep.wasm"]) await copy(`node_modules/onnxruntime-web/dist/${file}`, `runtime/${file}`);
for (const [pkg, name] of [["kokoro-js", "Kokoro-Apache-2.0.txt"], ["phonemizer", "Phonemizer-Apache-2.0.txt"]]) await copy(`node_modules/${pkg}/LICENSE`, name);
await copy("src/simulator/ONNX-MIT.txt", "ONNX-MIT.txt");
await writeFile(path.join(output, "NOTICE.txt"), `Kokoro-82M v1.0: https://huggingface.co/hexgrad/Kokoro-82M (Apache-2.0).\nONNX conversion: https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX revision ${revision}.\nKokoro.js 1.2.1: https://github.com/hexgrad/kokoro (Apache-2.0).\nONNX Runtime Web 1.22.0-dev.20250409-89f8206ba4: https://github.com/microsoft/onnxruntime (MIT).\nPhonemizer.js: https://github.com/xenova/phonemizer.js (Apache-2.0), includes eSpeak NG: https://github.com/espeak-ng/espeak-ng.\n`);
console.log("Self-hosted Kokoro radio assets ready.");
