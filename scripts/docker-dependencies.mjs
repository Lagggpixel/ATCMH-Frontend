import {readFileSync, mkdirSync, writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {join} from "node:path";

// Only the application's version is irrelevant to dependency installation.
// Preserve dependency versions, scripts, overrides and every other lock field.
export function dependencyManifests(root) {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
  if (pkg.version !== lock.version || pkg.version !== lock.packages?.[""]?.version) {
    throw new Error("package.json and package-lock.json versions must match");
  }
  pkg.version = lock.version = lock.packages[""].version = "0.0.0";
  const files = {"package.json": `${JSON.stringify(pkg, null, 2)}\n`, "package-lock.json": `${JSON.stringify(lock, null, 2)}\n`};
  const hash = createHash("sha256").update(JSON.stringify(files)).digest("hex");
  return {files, path: join(root, "build", "docker-dependencies", hash)};
}

export function prepareDependencyManifests(root, dryRun = false) {
  const manifests = dependencyManifests(root);
  if (!dryRun) {
    mkdirSync(manifests.path, {recursive: true});
    for (const [name, contents] of Object.entries(manifests.files)) writeFileSync(join(manifests.path, name), contents);
  }
  return manifests.path;
}
