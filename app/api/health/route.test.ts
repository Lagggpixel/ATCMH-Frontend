import assert from "node:assert/strict";
import test from "node:test";

import { GET } from "./route";

test("GET /api/health returns the service readiness payload", async () => {
  const response = GET();

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
});
