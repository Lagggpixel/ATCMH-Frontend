import assert from "node:assert/strict";
import test from "node:test";

import { loadPublicRuntimeConfig, resolvePublicRuntimeConfig } from "./runtime-config";

test("safe runtime URLs are validated and normalized", () => {
  assert.deepEqual(loadPublicRuntimeConfig({
    FRONTEND_PUBLIC_ORIGIN: "https://www.atcmh.org/",
    DASHBOARD_API_URL: "https://dashboard-api.atcmh.org/",
  }), {
    frontendPublicOrigin: "https://www.atcmh.org",
    dashboardApiUrl: "https://dashboard-api.atcmh.org",
  });
});

test("runtime config rejects paths, credentials, and non-loopback HTTP", () => {
  for (const value of ["http://atcmh.org", "https://user:pass@atcmh.org", "https://www.atcmh.org/path"]) {
    assert.throws(() => loadPublicRuntimeConfig({ FRONTEND_PUBLIC_ORIGIN: value, DASHBOARD_API_URL: "https://dashboard-api.atcmh.org" }));
  }
});

test("no secret is sourced from a NEXT_PUBLIC variable", () => {
  assert.throws(() => loadPublicRuntimeConfig({
    FRONTEND_PUBLIC_ORIGIN: "https://www.atcmh.org",
    DASHBOARD_API_URL: "https://dashboard-api.atcmh.org",
    NEXT_PUBLIC_EXAMS_AUTH_KEY: "leaked",
  }));
});

test("production fails closed while development and test use loopback defaults", () => {
  assert.throws(() => resolvePublicRuntimeConfig({}, "production"));
  assert.deepEqual(resolvePublicRuntimeConfig({}, "development"), {
    frontendPublicOrigin: "http://localhost:3000",
    dashboardApiUrl: "http://localhost:3001",
  });
  assert.deepEqual(resolvePublicRuntimeConfig({}, "test"), {
    frontendPublicOrigin: "http://localhost:3000",
    dashboardApiUrl: "http://localhost:3001",
  });
});
