import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Dashboard receives its backend URL at runtime and keeps Exams calls same-origin", () => {
  const api = readFileSync(new URL("./dashboard/utils/ApiUtils.ts", import.meta.url), "utf8");
  const exams = readFileSync(new URL("./dashboard/utils/ExamsApiUtils.ts", import.meta.url), "utf8");
  const provider = readFileSync(new URL("./dashboard/DashboardProvider.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(api, /import\.meta/);
  assert.match(provider, /dashboardApiUrl/);
  assert.match(provider, /configureDashboardApiUrl/);
  assert.doesNotMatch(exams, /VITE_|https:\/\/exams\.atcmh\.org/);
  assert.match(exams, /\/exams\/api\/auth\/session/);
  assert.match(exams, /\/exams\/api\/management/);
});
