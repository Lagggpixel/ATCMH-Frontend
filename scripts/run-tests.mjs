import {readdirSync} from "node:fs";
import {resolve, join, dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";

// Release snapshots and generated output are not additional source test suites.
const generated = new Set(["node_modules", ".git", "build", "dist", "out", "coverage"]);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const files = [];
function visit(directory) {
  for (const entry of readdirSync(join(root, directory), {withFileTypes: true})) {
    const relative = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!generated.has(entry.name) && !entry.name.startsWith(".next")) visit(relative);
    } else if (entry.isFile() && /(?:^|[.-])(?:test|spec)\.[cm]?[jt]sx?$/.test(entry.name)) {
      files.push(relative);
    }
  }
}
visit("");
files.sort();
if (!files.length) throw new Error("No source tests discovered.");
if (process.argv.includes("--list")) console.log(files.join("\n"));
else {
  console.log(`Running all ${files.length} source test files (generated output and release snapshots excluded).`);
  // node --test treats each path as a glob, so a literal "[" (dynamic route folders) must be escaped or the file is skipped.
  const patterns = files.map(file => file.replaceAll("\\", "/").replaceAll("[", "[[]"));
  const result = spawnSync(process.execPath, ["--import", "tsx", "--test", "--test-concurrency=4", ...process.argv.slice(2), ...patterns], {
    cwd: root, stdio: "inherit", env: {...process.env, TSX_TSCONFIG_PATH: join(root, "tsconfig.test.json")},
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
