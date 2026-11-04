import {spawnSync} from "node:child_process";
import {createHash, randomUUID} from "node:crypto";
import {existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync} from "node:fs";
import {join, resolve} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";

const project = fileURLToPath(new URL("../", import.meta.url));
const digest = text => createHash("sha256").update(text).digest("hex");
const normalize = text => text.replaceAll("\r\n", "\n");

export function sharedEngineCheckout(root) {
  return resolve(process.env.SWEATBOX_ENGINE_CHECKOUT || join(root, "..", "Simulator"));
}

function readLock(root) {
  const {revision, files} = JSON.parse(readFileSync(join(root, "scripts", "sweatbox-engine-lock.json"), "utf8"));
  if (!/^[a-f0-9]{40}$/.test(revision) || !files || !Object.keys(files).length ||
    Object.entries(files).some(([file, hash]) => !/^[a-z0-9][a-z0-9-]*\.ts$/.test(file) || !/^[a-f0-9]{64}$/.test(hash))) {
    throw new Error("Invalid Sweatbox engine lock.");
  }
  return {revision, files};
}

function readVerified(directory, files) {
  const entries = [];
  for (const [file, expected] of Object.entries(files)) {
    const path = join(directory, file);
    if (!existsSync(path)) return;
    const text = normalize(readFileSync(path, "utf8"));
    if (digest(text) !== expected) return;
    entries.push([file, text]);
  }
  return entries;
}

function readGitBlobs(checkout, revision, files) {
  const paths = Object.keys(files);
  const input = paths.map(file => revision + ":src/simulator/" + file).join("\n") + "\n";
  const result = spawnSync("git", ["-C", checkout, "cat-file", "--batch"], {input, maxBuffer: 16 * 1024 * 1024});
  const output = result.stdout;
  const missing = () => new Error("Cannot read pinned Sweatbox engine " + revision + " from " + checkout +
    ". Fetch that revision in the standalone checkout and set SWEATBOX_ENGINE_CHECKOUT to its path.");
  if (result.error || result.status !== 0 || !output) throw missing();
  let position = 0;
  return paths.map(file => {
    const separator = output.indexOf(10, position);
    const header = separator < 0 ? null : /^[a-f0-9]+ blob (\d+)$/.exec(output.toString("ascii", position, separator));
    if (!header) throw missing();
    const start = separator + 1, end = start + Number(header[1]);
    if (output[end] !== 10) throw missing();
    position = end + 1;
    const text = normalize(output.toString("utf8", start, end));
    if (digest(text) !== files[file]) throw new Error("Pinned Sweatbox engine checksum mismatch for " + file);
    return [file, text];
  });
}

export function assertCanonicalEngine(root, checkout) {
  const {revision, files} = readLock(root);
  const canonical = JSON.parse(readFileSync(join(checkout, "scripts", "shared-engine-files.json"), "utf8"));
  if (JSON.stringify([...canonical].sort()) !== JSON.stringify(Object.keys(files).sort()) ||
    !readVerified(join(checkout, "src", "simulator"), files)) {
    throw new Error("Standalone engine source differs from the ATCMH pin " + revision + ". Use matching checkouts.");
  }
}

export function prepareSharedEngine(root = project, {checkout = sharedEngineCheckout(root), docker = false, dryRun = false} = {}) {
  const {revision, files} = readLock(root);
  const native = join(root, "src", "simulator");
  const stage = join(root, "build", "sweatbox-engine", revision);
  const destination = docker ? stage : native;
  if (dryRun) return destination;
  if (docker && existsSync(stage) && readdirSync(stage, {withFileTypes: true}).some(entry => !entry.isFile() || !Object.hasOwn(files, entry.name))) {
    throw new Error("Unexpected files in the Sweatbox engine Docker context " + stage);
  }
  if (readVerified(destination, files)) return destination;
  const sources = readVerified(docker ? native : stage, files) ?? readGitBlobs(checkout, revision, files);
  mkdirSync(destination, {recursive: true});
  for (const [file, text] of sources) {
    const target = join(destination, file);
    const temporary = target + "." + randomUUID() + ".tmp";
    writeFileSync(temporary, text, {flag: "wx"});
    renameSync(temporary, target);
  }
  return destination;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) prepareSharedEngine();
