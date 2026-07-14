import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("start route keeps signed-out and signed-in redirects on the browser origin", () => {
  const caseFile = fileURLToPath(new URL("../../start-route.case.test.ts", import.meta.url));
  const result = spawnSync(process.execPath, ["--conditions=react-server", "--experimental-test-module-mocks", "--import", "tsx", "--test", caseFile], {
    cwd: fileURLToPath(new URL("../../../../../", import.meta.url)),
    encoding: "utf8",
    env: { ...process.env, NODE_TEST_CONTEXT: undefined, FRONTEND_PUBLIC_ORIGIN: "https://public.exams.example", ROUTE_CASE_RUN: "1" },
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /tests 1/);
});
