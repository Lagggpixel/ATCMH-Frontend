import {spawn, spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {copyFileSync, createWriteStream, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const read = path => JSON.parse(readFileSync(path, "utf8"));

export function command(command, args, cwd = root) {
  const result = spawnSync(command, args, {cwd, encoding: "utf8", maxBuffer: 32 * 1024 * 1024});
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.slice(0, 3).join(" ")} failed (${result.status}): ${result.stderr?.trim()}`);
  return result.stdout.trim();
}

// Include modified AND untracked non-ignored files. A changed source, config,
// dependency lock or check script invalidates every downstream release gate.
function sourceFiles(directory) {
  const paths = command("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], directory).split("\0").filter(Boolean);
  return [...new Set(paths)].sort();
}

export function sourceHash(directory = root) {
  const hash = createHash("sha256");
  for (const path of sourceFiles(directory)) {
    const absolute = join(directory, path);
    if (!existsSync(absolute)) {hash.update(`${path}\0deleted\0`); continue;}
    if (!lstatSync(absolute).isFile()) throw new Error(`Release source must be a regular file: ${path}`);
    hash.update(`${path}\0${sha(readFileSync(absolute))}\0`);
  }
  return hash.digest("hex");
}

function treeHash(directory) {
  const hash = createHash("sha256");
  function visit(relative) {
    for (const entry of readdirSync(join(directory, relative), {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(relative, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) hash.update(`${path}\0${sha(readFileSync(join(directory, path)))}\0`);
      else throw new Error("Test fixtures must contain regular files/directories");
    }
  }
  visit("");
  return hash.digest("hex");
}

export function releaseTarget(name) {
  const targets = {
    "atcmh-frontend": {image: "registry.lagggpixel.com/atcmh-frontend", origin: "https://www.atcmh.org", stack: 30, stackName: "atcmh", containers: ["atcmh-frontend", "atcmh-simulator-retention"]},
    sweatbox: {image: "registry.lagggpixel.com/sweatbox", origin: "https://sweatbox.lagggpixel.com", stack: 66, stackName: "sweatbox", containers: ["sweatbox", "sweatbox-retention"]},
  };
  if (!targets[name]) throw new Error(`Unknown release project: ${name}`);
  return {...targets[name], endpoint: 3, platform: "linux/amd64"};
}

export function requireChecked(receipt, source, imageId) {
  if (receipt.source !== source || !receipt.checked || (receipt.imageRef ?? receipt.imageId) !== imageId) {
    throw new Error("Source or image changed, or checks are incomplete; run release:check again");
  }
}

export function requireQA(receipt, source, imageId) {
  requireChecked(receipt, source, imageId);
  if (!receipt.qa || !existsSync(receipt.qa.script) || sha(readFileSync(receipt.qa.script)) !== receipt.qa.sha256) {
    throw new Error("Matching browser QA is required; run release:qa -- --script <browser-check.mjs>");
  }
}

export function requirePublishedImage(imageRef, published, latest) {
  // Classic Docker identifies images by config; Docker 29's containerd store
  // may identify them by manifest or index. All three are content-addressed.
  if (![published.digest, published.platformDigest, published.imageId].includes(imageRef) || latest.digest !== published.digest) {
    throw new Error("Published version/latest/image digests do not match");
  }
}

function logged(commandName, args, name, directory, env = {}, cwd = root) {
  const started = Date.now();
  const log = join(directory, `${name}.log`);
  console.log(`${name} started (${log})`);
  return new Promise((resolveJob, reject) => {
    const stream = createWriteStream(log);
    const child = spawn(commandName, args, {cwd, env: {...process.env, ...env}, stdio: ["ignore", "pipe", "pipe"]});
    child.stdout.pipe(stream, {end: false});
    child.stderr.pipe(stream, {end: false});
    child.once("error", error => {stream.end(); reject(error);});
    child.once("close", code => stream.end(() => {
      const seconds = (Date.now() - started) / 1000;
      console.log(`${name} ${code === 0 ? "passed" : "failed"} in ${seconds.toFixed(1)}s`);
      if (code === 0) resolveJob({seconds, log});
      else reject(new Error(`${name} failed (${code}); see ${log}`));
    }));
  });
}

function publishedImage(image) {
  const index = JSON.parse(command("docker", ["buildx", "imagetools", "inspect", image, "--format", "{{json .Manifest}}"]));
  const manifest = JSON.parse(command("docker", ["buildx", "imagetools", "inspect", `${image}@${index.digest}`, "--raw"]));
  // --load followed by docker push may publish a single-platform manifest.
  if (!manifest.manifests && manifest.config?.digest) return {digest: index.digest, platformDigest: index.digest, imageId: manifest.config.digest};
  const platforms = manifest.manifests?.filter(item => item.platform.os === "linux" && item.platform.architecture === "amd64");
  if (platforms?.length !== 1) throw new Error("Expected exactly one linux/amd64 image");
  const platform = JSON.parse(command("docker", ["buildx", "imagetools", "inspect", `${image}@${platforms[0].digest}`, "--raw"]));
  return {digest: index.digest, platformDigest: platforms[0].digest, imageId: platform.config.digest};
}

export async function main(args = process.argv.slice(2)) {
  const [phase, ...options] = args;
  if (!["check", "qa", "publish", "deploy"].includes(phase)) throw new Error("Use check, qa, publish or deploy");
  const dryRun = options.includes("--dry-run");
  const scriptIndex = options.indexOf("--script");
  const script = scriptIndex >= 0 ? options[scriptIndex + 1] : undefined;
  const remaining = options.filter((_, index) => index !== scriptIndex && (scriptIndex < 0 || index !== scriptIndex + 1));
  if (remaining.some(option => option !== "--dry-run") || (scriptIndex >= 0 && (!script || script.startsWith("--")))) throw new Error("Unknown or incomplete release option");
  if (script && !["qa", "deploy"].includes(phase)) throw new Error("--script is only valid for qa or deploy");
  const pkg = read(join(root, "package.json"));
  const lock = read(join(root, "package-lock.json"));
  if (pkg.version !== lock.version || pkg.version !== lock.packages[""].version) throw new Error("Package and lock versions differ");
  const target = releaseTarget(pkg.name);
  const directory = join(root, "build", "release");
  const receiptPath = join(directory, "receipt.json");
  if (dryRun) {
    console.log(JSON.stringify({phase, version: pkg.version, ...target, receiptPath, script,
      checks: ["full tests", "source lint", "Docker production build including TypeScript", "browser QA of the built image", "unchanged source/image", "registry digests", "Portainer configuration and runtime health", "published browser QA"],
      builds: phase === "check" ? 1 : 0, publishes: phase === "publish", deploys: phase === "deploy"}, null, 2));
    return;
  }
  mkdirSync(directory, {recursive: true});
  const lockPath = join(directory, "lock");
  mkdirSync(lockPath); // Exclusive per-checkout workflow; inspect stale locks after an interruption.
  try {
    const source = sourceHash();
    const image = `${target.image}:${pkg.version}`;
    const save = receipt => writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
    const assertSource = () => {if (sourceHash() !== source) throw new Error("Source changed during release checks; rerun release:check");};
    const sharedScript = pkg.name === "sweatbox" ? join(root, "scripts/sync-simulator.mjs") : join(root, "../Simulator/scripts/sync-simulator.mjs");
    const assertShared = () => {
      if (!existsSync(sharedScript)) throw new Error("Place both web checkouts beside each other for the required shared-file check");
      command(process.execPath, [sharedScript, "--check"]);
    };
    const imageId = () => command("docker", ["image", "inspect", image, "--format", "{{.Id}}"]);
    if (phase === "check") {
      const receipt = {schema: 1, source, version: pkg.version, target, checked: false, timings: {}};
      save(receipt); // Invalidate old publication/QA evidence before any checks run.
      assertShared();
      const snapshot = join(directory, "sources", `${source}-${Date.now()}`);
      mkdirSync(snapshot, {recursive: true});
      const hashes = {};
      for (const path of sourceFiles(root)) {
        if (!existsSync(join(root, path))) continue;
        if (/(^|\/)\.env(?!\.example$)|\.clixml$/i.test(path)) throw new Error("Never copy credential files into release snapshots");
        mkdirSync(dirname(join(snapshot, path)), {recursive: true});
        copyFileSync(join(root, path), join(snapshot, path));
        hashes[path] = sha(readFileSync(join(snapshot, path)));
      }
      const assertSnapshot = () => {
        for (const [path, expected] of Object.entries(hashes)) if (sha(readFileSync(join(snapshot, path))) !== expected) throw new Error(`Frozen release source changed: ${path}`);
      };
      assertSource();
      // Native dependencies remain on the native OS. Docker installs its own Linux dependencies.
      symlinkSync(join(root, "node_modules"), join(snapshot, "node_modules"), process.platform === "win32" ? "junction" : "dir");
      const fixtureLink = join(snapshot, "public/simulator/recordings-v1");
      let fixture;
      if (pkg.name === "atcmh-frontend" && !existsSync(fixtureLink)) {
        fixture = resolve(process.env.RELEASE_RECORDINGS_FIXTURE ?? join(root, "../Simulator/public/simulator/recordings-v1"));
        receipt.fixture = {path: fixture, sha256: treeHash(fixture)};
        symlinkSync(fixture, fixtureLink, process.platform === "win32" ? "junction" : "dir");
      }
      // Native checks overlap; Docker builds stay sequential to respect the 6 GiB WSL cap.
      let results;
      try {
        results = await Promise.allSettled([
          logged(process.execPath, ["scripts/run-tests.mjs"], "tests", directory, {}, snapshot),
          logged(process.execPath, ["node_modules/eslint/bin/eslint.js", "src", "scripts"], "lint", directory, {}, snapshot),
        ]);
      } finally {
        if (fixture) rmSync(fixtureLink); // Remove only the junction, never its shared target.
      }
      for (const result of results) if (result.status === "rejected") throw result.reason;
      [receipt.timings.tests, receipt.timings.lint] = results.map(result => result.value);
      assertSource();
      assertSnapshot();
      assertShared();
      if (fixture && treeHash(fixture) !== receipt.fixture.sha256) throw new Error("Shared test recordings changed during checks");
      // Use the familiar build-only entry point; never publish during verification.
      receipt.timings.build = await logged(process.execPath, ["scripts/docker-build-only.mjs"], "build", directory, {}, snapshot);
      // Track the local immutable reference here. The verified registry
      // manifest supplies the remote config digest after publication.
      receipt.imageRef = imageId();
      receipt.buildDigest = read(join(snapshot, "build/docker-build-metadata.json"))["containerimage.digest"];
      if (!/^sha256:[a-f0-9]{64}$/.test(receipt.buildDigest ?? "")) throw new Error("BuildKit did not return an image digest");
      assertSource();
      assertSnapshot();
      receipt.snapshot = snapshot;
      receipt.sourceFiles = hashes;
      receipt.checked = true;
      receipt.checkedAt = new Date().toISOString();
      save(receipt);
      console.log("Tests, lint and production TypeScript/build passed. Run browser QA before publication.");
      return;
    }
    const receipt = read(receiptPath);
    if (receipt.version !== pkg.version || JSON.stringify(receipt.target) !== JSON.stringify(target)) throw new Error("Release target/version changed");
    requireChecked(receipt, source, imageId());
    assertShared();
    if (receipt.fixture && treeHash(receipt.fixture.path) !== receipt.fixture.sha256) throw new Error("Shared test recordings changed; rerun release:check");
    if (phase === "qa" || phase === "deploy") {
      if (!script || !existsSync(resolve(script))) throw new Error("Provide --script <browser-check.mjs>; browser checks cannot be skipped");
    }
    if (phase === "qa") {
      delete receipt.qa;
      delete receipt.published;
      save(receipt);
      const absolute = resolve(script), scriptHash = sha(readFileSync(absolute));
      receipt.timings.qa = await logged(process.execPath, [absolute], "browser", directory, {
        RELEASE_PHASE: "image", RELEASE_IMAGE: receipt.imageRef, RELEASE_VERSION: pkg.version, RELEASE_ORIGIN: target.origin,
      });
      assertSource();
      requireChecked(receipt, source, imageId());
      if (sha(readFileSync(absolute)) !== scriptHash) throw new Error("Browser script changed during verification");
      receipt.qa = {script: absolute, sha256: scriptHash, completedAt: new Date().toISOString()};
      save(receipt);
      return;
    }
    requireQA(receipt, source, imageId());
    if (phase === "publish") {
      const date = new Intl.DateTimeFormat("en-GB", {timeZone: "Europe/London", year: "2-digit", month: "numeric"}).formatToParts(new Date());
      const prefix = `${date.find(part => part.type === "year").value}.${Number(date.find(part => part.type === "month").value)}.`;
      if (!pkg.version.startsWith(prefix)) throw new Error("Release version must use the current Europe/London year/month");
      const probe = spawnSync("docker", ["buildx", "imagetools", "inspect", image], {encoding: "utf8"});
      if (probe.error) throw probe.error;
      if (probe.status === 0 || !/not found|manifest unknown/i.test(`${probe.stderr}${probe.stdout}`)) throw new Error("Version is already published, or registry availability is unverified; never overwrite it");
      // Tag by verified immutable image ID; no second compilation or moving-tag race.
      command("docker", ["image", "tag", receipt.imageRef, image]);
      command("docker", ["image", "tag", receipt.imageRef, `${target.image}:latest`]);
      receipt.timings.pushVersion = await logged("docker", ["push", image], "push-version", directory);
      receipt.timings.pushLatest = await logged("docker", ["push", `${target.image}:latest`], "push-latest", directory);
      const published = publishedImage(image), latest = publishedImage(`${target.image}:latest`);
      requirePublishedImage(receipt.imageRef, published, latest);
      assertSource();
      receipt.imageId = published.imageId;
      receipt.published = {...published, completedAt: new Date().toISOString()};
      save(receipt);
      return;
    }
    if (!receipt.published || receipt.published.imageId !== receipt.imageId) throw new Error("Successful matching publication is required before deployment");
    if (process.platform !== "win32") throw new Error("Saved Portainer DPAPI credentials require this Windows account; deploy from the Windows checkout");
    const published = publishedImage(image);
    if (published.digest !== receipt.published.digest || published.imageId !== receipt.imageId) throw new Error("Published image changed since verification");
    const absolute = resolve(script), scriptHash = sha(readFileSync(absolute));
    receipt.timings.deploy = await logged("pwsh", ["-NoProfile", "-File", join(root, "scripts/release-deploy.ps1"), "-ReceiptPath", receiptPath], "deploy", directory);
    receipt.timings.liveQA = await logged(process.execPath, [absolute], "live-browser", directory, {
      RELEASE_PHASE: "published", RELEASE_IMAGE: receipt.imageRef, RELEASE_IMAGE_ID: receipt.imageId, RELEASE_VERSION: pkg.version, RELEASE_ORIGIN: target.origin,
    });
    assertSource();
    if (sha(readFileSync(absolute)) !== scriptHash) throw new Error("Live browser script changed during verification");
    receipt.deployed = {completedAt: new Date().toISOString(), script: absolute, sha256: scriptHash};
    save(receipt);
    console.log("Deployment, public version/health and published browser checks passed.");
  } finally {
    rmSync(lockPath, {recursive: true});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {console.error(error.message); process.exitCode = 1;});
}
