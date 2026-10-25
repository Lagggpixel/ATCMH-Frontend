import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";
import {dependencyManifests} from "./docker-dependencies.mjs";
import {runDockerBuild} from "./docker-build.mjs";
import {command, requireChecked, requireQA, requirePublishedImage, releaseTarget, sourceHash} from "./release.mjs";

const sha = bytes => createHash("sha256").update(bytes).digest("hex");
function temporary(t) {
  const root = mkdtempSync(join(tmpdir(), "web-release-"));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  return root;
}
function manifests(root, version, dependency = "1.2.3") {
  const pkg = {name: "test", version, scripts: {build: "next build"}, dependencies: {example: dependency}};
  const lock = {name: "test", version, lockfileVersion: 3, packages: {"": {name: "test", version, dependencies: pkg.dependencies}, "node_modules/example": {version: dependency, integrity: "sha512-test"}}};
  writeFileSync(join(root, "package.json"), JSON.stringify(pkg));
  writeFileSync(join(root, "package-lock.json"), JSON.stringify(lock));
}

test("a version-only bump preserves dependency cache identity and does not edit authoritative manifests", t => {
  const root = temporary(t);
  manifests(root, "26.10.70");
  const before = dependencyManifests(root);
  manifests(root, "26.10.71");
  const after = dependencyManifests(root);
  assert.deepEqual(before, after);
  assert.equal(JSON.parse(readFileSync(join(root, "package.json"))).version, "26.10.71");
  assert.equal(JSON.parse(after.files["package-lock.json"]).packages["node_modules/example"].version, "1.2.3");
  manifests(root, "26.10.71", "1.2.4");
  assert.notEqual(dependencyManifests(root).path, before.path);
  const pkg = JSON.parse(readFileSync(join(root, "package.json")));
  pkg.scripts.postinstall = "node install.mjs";
  writeFileSync(join(root, "package.json"), JSON.stringify(pkg));
  const scripted = dependencyManifests(root);
  assert.equal(JSON.parse(scripted.files["package.json"]).scripts.postinstall, "node install.mjs");
});

test("lockfile version mismatch blocks dependency preparation", t => {
  const root = temporary(t);
  manifests(root, "26.10.70");
  const pkg = JSON.parse(readFileSync(join(root, "package.json")));
  pkg.version = "26.10.71";
  writeFileSync(join(root, "package.json"), JSON.stringify(pkg));
  assert.throws(() => dependencyManifests(root), /versions must match/);
});

test("source evidence detects edits, deletions and new files while ignoring generated output", t => {
  const root = temporary(t);
  command("git", ["init", "--quiet"], root);
  writeFileSync(join(root, ".gitignore"), "*.log\n");
  writeFileSync(join(root, "source.txt"), "first");
  command("git", ["add", "."], root);
  const first = sourceHash(root);
  writeFileSync(join(root, "output.log"), "generated");
  assert.equal(sourceHash(root), first);
  writeFileSync(join(root, "source.txt"), "second");
  assert.notEqual(sourceHash(root), first);
  writeFileSync(join(root, "source.txt"), "first");
  assert.equal(sourceHash(root), first);
  writeFileSync(join(root, "new.txt"), "untracked");
  assert.notEqual(sourceHash(root), first);
  rmSync(join(root, "new.txt"));
  rmSync(join(root, "source.txt"));
  assert.notEqual(sourceHash(root), first);
});

test("publication gates reject failed checks, changed source/image, missing or altered browser QA", t => {
  const root = temporary(t), script = join(root, "browser.mjs");
  const receipt = {checked: true, source: "source", imageId: "image"};
  requireChecked(receipt, "source", "image");
  requireChecked({...receipt, imageRef: "manifest"}, "source", "manifest");
  assert.throws(() => requireChecked({...receipt, imageRef: "manifest"}, "source", "image"), /changed/);
  assert.throws(() => requireChecked({...receipt, checked: false}, "source", "image"), /incomplete/);
  assert.throws(() => requireChecked(receipt, "changed", "image"), /changed/);
  assert.throws(() => requireChecked(receipt, "source", "other-image"), /changed/);
  assert.throws(() => requireQA(receipt, "source", "image"), /browser QA/);
  writeFileSync(script, "verified browser script");
  receipt.qa = {script, sha256: sha(readFileSync(script))};
  requireQA(receipt, "source", "image");
  writeFileSync(script, "modified browser script");
  assert.throws(() => requireQA(receipt, "source", "image"), /browser QA/);
});

test("release mappings keep ATCMH retention, backend, speech and persistent assets outside web updates", () => {
  assert.deepEqual(releaseTarget("atcmh-frontend").containers, ["atcmh-frontend"]);
  assert.deepEqual(releaseTarget("sweatbox").containers, ["sweatbox", "sweatbox-retention"]);
  assert.equal(releaseTarget("atcmh-frontend").stack, 30);
  assert.equal(releaseTarget("sweatbox").stack, 66);
  assert.throws(() => releaseTarget("other"), /Unknown/);
});

test("registry checks support classic/config, platform and Docker 29/index identities and reject mismatches", () => {
  const published = {imageId: "config", platformDigest: "platform", digest: "index"};
  for (const ref of ["config", "platform", "index"]) requirePublishedImage(ref, published, published);
  assert.throws(() => requirePublishedImage("other", published, published), /do not match/);
  assert.throws(() => requirePublishedImage("index", published, {...published, digest: "other"}), /do not match/);
});

for (const [platform, arch] of [["win32", "x64"], ["darwin", "x64"], ["darwin", "arm64"]]) {
  test(`${platform}/${arch}: portable helper targets Linux and separates build-only from publication`, () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
    const originalArch = Object.getOwnPropertyDescriptor(process, "arch");
    try {
      Object.defineProperty(process, "platform", {value: platform});
      Object.defineProperty(process, "arch", {value: arch});
      for (const publish of [false, true]) {
        const calls = [];
        const status = runDockerBuild({publish, options: [], run(command, args, options) {
          calls.push({command, args, options});
          return {status: 0, stdout: JSON.stringify({digest: `sha256:${"a".repeat(64)}`})};
        }});
        assert.equal(status, 0);
        const build = calls.at(-1);
        assert.equal(build.command, "docker");
        assert.equal(build.options.shell, undefined);
        assert.equal(build.args[build.args.indexOf("--platform") + 1], "linux/amd64");
        assert.match(build.args[build.args.indexOf("--build-context") + 1], /^dependency-manifests=/);
        assert.equal(build.args.includes("--push"), publish);
        assert.equal(build.args.includes("--load"), !publish);
      }
    } finally {
      Object.defineProperty(process, "platform", originalPlatform);
      Object.defineProperty(process, "arch", originalArch);
    }
  });
}

test("PowerShell deployment changes only expected image lines and rejects drift/redeployment", {skip: process.platform !== "win32"}, () => {
  const script = fileURLToPath(new URL("./release-deploy.ps1", import.meta.url));
  const result = spawnSync("pwsh", ["-NoProfile", "-Command", `
    try {
    . '${script.replaceAll("'", "''")}' -LoadFunctionsOnly
    $old='registry.example/web:1'; $new='registry.example/web:2'
    $compose=@('services:', '  web:', "    image: '$old' # keep", '    environment:', "      NOTE: '$old'", '  worker:', "    image: $old", '') -join [Environment]::NewLine
    $changed=Get-ReleaseCompose $compose $old $new 2
    if ($changed -cne $compose.Replace("image: '$old'", "image: '$new'").Replace("image: $old", "image: $new")) { throw 'Configuration changed' }
    $rejected=$false; try {Get-ReleaseCompose $compose $old $new 1} catch {$rejected=$true}
    if (-not $rejected) {throw 'Drift accepted'}
    $rejected=$false; try {Get-ReleaseCompose $compose $old $old 2} catch {$rejected=$true}
    if (-not $rejected) {throw 'Redeployment accepted'}
    } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }
  `], {encoding: "utf8"});
  assert.equal(result.status, 0, result.stderr);
});

for (const scenario of ["success", "endpoint", "missing-container", "concurrent-compose", "environment", "public-version", "unrelated"]) {
  test(`offline Portainer deployment: ${scenario}`, {skip: process.platform !== "win32"}, () => {
    const script = fileURLToPath(new URL("./release-deploy-mock.test.ps1", import.meta.url));
    const result = spawnSync("pwsh", ["-NoProfile", "-File", script, "-Scenario", scenario], {encoding: "utf8"});
    if (scenario === "success") assert.equal(result.status, 0, result.stderr);
    else {
      assert.notEqual(result.status, 0, "Unsafe/drifted deployment was accepted");
      const expected = {endpoint: /endpoint identity/, "missing-container": /container missing/, "concurrent-compose": /Stack changed/, environment: /preservation failed/, "public-version": /Public version\/health mismatch/, unrelated: /unrelated container changed/};
      assert.match(result.stderr, expected[scenario]);
    }
  });
}
