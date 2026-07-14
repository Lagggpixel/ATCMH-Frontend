import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("central session response matches the Dashboard cross-origin contract", () => {
  const caseFile = fileURLToPath(new URL("./route.case.test.ts", import.meta.url));
  const result = spawnSync(process.execPath, ["--conditions=react-server", "--experimental-test-module-mocks", "--import", "tsx", "--test", caseFile], {
    cwd: fileURLToPath(new URL("../../../../", import.meta.url)), encoding: "utf8", env: { ...process.env, NODE_TEST_CONTEXT: undefined, SESSION_ROUTE_CASE: "1" },
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
