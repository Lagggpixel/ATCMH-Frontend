import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { centralLoginUrl } from "./central-auth";

const env = {
  DASHBOARD_API_URL: "https://dashboard-api.atcmh.org", EXAMS_AUTH_KEY: "auth-key",
  EXAMS_CSRF_SECRET: "x".repeat(32), FRONTEND_PUBLIC_ORIGIN: "https://atcmh.org",
};

test("Exams login emits the encoded return path required by central auth", () => {
  const login = centralLoginUrl("ifc", "/exams/quizzes", env);
  assert.equal(login.origin, "https://dashboard-api.atcmh.org");
  assert.equal(login.pathname, "/auth/login");
  assert.deepEqual(Object.fromEntries(login.searchParams), {
    provider: "ifc",
    app: "exams",
    returnTo: "/exams/api/auth/callback?returnTo=%2Fexams%2Fquizzes",
  });
});

test("Dashboard Exams impersonation stays inside the unified Frontend", () => {
  const dashboard = readFileSync(new URL("../dashboard/components/admin/AdminAccounts.tsx", import.meta.url), "utf8");
  const dashboardAuth = readFileSync(new URL("../dashboard/utils/AuthSessionUtils.ts", import.meta.url), "utf8");
  assert.match(dashboard, /handoff/);
  assert.match(dashboardAuth, /\/exams\/api\/auth\/callback/);
  assert.match(dashboardAuth, /returnTo.*\/exams/);
});

test("Dashboard category PATCH matches the Frontend-owned Exams preflight contract", () => {
  const dashboardApi = readFileSync(new URL("../dashboard/utils/ExamsApiUtils.ts", import.meta.url), "utf8");
  const examsCors = readFileSync(new URL("./management-cors.ts", import.meta.url), "utf8");
  assert.match(dashboardApi, /method:\s*"PATCH"/);
  assert.match(examsCors, /GET, POST, PUT, PATCH, DELETE, OPTIONS/);
});

test("Exams callback handles the documented central-auth outcomes locally", () => {
  const exams = readFileSync(new URL("../../app/exams/api/auth/callback/route.ts", import.meta.url), "utf8");
  for (const code of ["cancelled", "provider_failure", "consent_declined", "invalid_consent", "consent_expired"]) {
    assert.match(exams, new RegExp(`"${code}"`));
  }
  assert.match(exams, /invalid_handoff/);
  assert.match(exams, /\/exams\?authError=/);
});
