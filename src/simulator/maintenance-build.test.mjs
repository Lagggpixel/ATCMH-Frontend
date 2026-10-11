import assert from "node:assert/strict";
import test from "node:test";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {buildSimulatorMaintenance} from "./build-maintenance.mjs";

test("production maintenance bundle runs without tsx and rejects invalid arguments safely", () => {
  const root = mkdtempSync(join(tmpdir(), "atcmh-maintenance-"));
  try {
    buildSimulatorMaintenance(root);
    const result = spawnSync(process.execPath, [join(root, "src/simulator/maintenance.js"), "--invalid"], {encoding: "utf8"});
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Simulator maintenance failed; transaction rolled back/);
    assert.doesNotMatch(result.stderr, /MODULE_NOT_FOUND|password|mysql:\/\//i);
    assert.equal(result.stdout, "");
  } finally {rmSync(root, {recursive: true, force: true});}
});
