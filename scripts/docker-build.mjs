import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {prepareDependencyManifests} from "./docker-dependencies.mjs";
import {join} from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const image = "registry.lagggpixel.com/atcmh-frontend";
const target = "linux/amd64";

export function runDockerBuild({ publish = false, options = process.argv.slice(2), run = spawnSync } = {}) {
  const unknown = options.filter((option) => option !== "--dry-run");
  if (unknown.length) throw new Error(`Unknown build option: ${unknown.join(" ")}`);

  const host = { win32: "Windows", darwin: "macOS", linux: "Linux" }[process.platform] ?? process.platform;
  console.log(`Detected ${host} (${process.arch}); building ATCMH frontend ${version} for ${target}.`);
  console.log("Docker automatically selects native execution or CPU emulation for the Linux server target.");

  const args = [
    "buildx", "build",
    "-f", ".dockerfile",
    "--platform", target,
    "--build-context", `dependency-manifests=${prepareDependencyManifests(root, options.includes("--dry-run"))}`,
    "--metadata-file", join(root, "build", "docker-build-metadata.json"),
    "-t", `${image}:${version}`,
    "-t", `${image}:latest`,
    publish ? "--push" : "--load",
    ".",
  ];

  if (options.includes("--dry-run")) {
    console.log(JSON.stringify({ command: "docker", args, cwd: root }, null, 2));
    return 0;
  }

  const result = run("docker", args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  return result.status ?? 1;
}
