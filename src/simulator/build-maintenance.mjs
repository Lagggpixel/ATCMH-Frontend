import ts from "typescript";
import {cpSync, existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";

export function buildSimulatorMaintenance(output, root = fileURLToPath(new URL("../../", import.meta.url))) {
  // Next bundles the app's database driver; the standalone CLI needs its own runtime files.
  const copied = new Map();
  function copyDependency(name, from) {
    const require = createRequire(join(from, "package.json"));
    let source = dirname(require.resolve(name));
    while (!existsSync(join(source, "package.json")) || JSON.parse(readFileSync(join(source, "package.json"), "utf8")).name !== name) {
      const parent = dirname(source);
      if (parent === source) throw new Error(`Cannot locate maintenance dependency ${name}`);
      source = parent;
    }
    const manifest = JSON.parse(readFileSync(join(source, "package.json"), "utf8"));
    if (copied.has(name)) {
      if (copied.get(name) !== manifest.version) throw new Error(`Conflicting maintenance dependency ${name}`);
      return;
    }
    copied.set(name, manifest.version);
    cpSync(source, join(output, "node_modules", name), {recursive: true});
    for (const dependency of Object.keys(manifest.dependencies ?? {})) copyDependency(dependency, source);
  }
  copyDependency("mysql2", root);
  copyDependency("zod", root);
  const emitted = new Set();
  function emit(file) {
    if (emitted.has(file)) return;
    emitted.add(file);
    const target = join(output, file.replace(/\.ts$/, ".js"));
    mkdirSync(dirname(target), {recursive: true});
    if (file.endsWith(".json")) {cpSync(join(root, file), target); return;}
    const result = ts.transpileModule(readFileSync(join(root, file), "utf8"), {
      compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true},
    });
    writeFileSync(target, result.outputText);
    // Follow emitted runtime imports only; type imports do not expand the CLI bundle.
    for (const match of result.outputText.matchAll(/require\(["'](\.[^"']+)["']\)/g)) {
      const dependency = join(dirname(file), match[1]);
      emit(existsSync(join(root, dependency + ".ts")) ? dependency + ".ts" : dependency);
    }
  }
  emit("src/simulator/maintenance.ts");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  buildSimulatorMaintenance(resolve("maintenance"));
