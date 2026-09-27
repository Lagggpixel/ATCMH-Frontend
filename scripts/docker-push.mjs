import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const image = "registry.lagggpixel.com/atcmh-frontend";

const result = spawnSync("docker", [
  "buildx", "build",
  "-f", ".dockerfile",
  "--platform", "linux/amd64,linux/arm64",
  "-t", `${image}:${version}`,
  "-t", `${image}:latest`,
  ".", "--push",
], { cwd: root, stdio: "inherit" });

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
