import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { centralLoginUrl } from "./central-auth";

const env = {
  DASHBOARD_API_URL: "https://dashboard-api.atcmh.org", EXAMS_AUTH_KEY: "auth-key",
  EXAMS_CSRF_SECRET: "x".repeat(32), FRONTEND_PUBLIC_ORIGIN: "https://atcmh.org",
};

test("Exams returnTo shape satisfies Dashboard-Backend AuthReturnPolicy", () => {
  const backendPolicy = readFileSync(new URL("../../../Dashboard-Backend/src/main/java/me/reid/auth/AuthReturnPolicy.java", import.meta.url), "utf8");
  assert.match(backendPolicy, /case DASHBOARD -> rawPath\.equals\("\/dashboard"\)/);
  assert.match(backendPolicy, /case EXAMS -> rawPath\.equals\("\/exams"\)/);
  const returnTo = centralLoginUrl("ifc", "/exams/quizzes", env).searchParams.get("returnTo")!;
  assert.ok(returnTo.startsWith("/"));
  assert.ok(!returnTo.startsWith("//"));
  assert.ok(!new URL(returnTo, "https://atcmh.org").pathname.startsWith("/auth/"));
});

test("Dashboard Exams impersonation destination is accepted directly or by the root compatibility bridge", () => {
  const dashboard = readFileSync(new URL("../dashboard/components/admin/AdminAccounts.tsx", import.meta.url), "utf8");
  const dashboardAuth = readFileSync(new URL("../dashboard/utils/AuthSessionUtils.ts", import.meta.url), "utf8");
  const examsHome = readFileSync(new URL("../../app/exams/(learner)/page.tsx", import.meta.url), "utf8");
  assert.match(dashboard, /handoff/);
  assert.ok(/\/exams\/api\/auth\/callback/.test(dashboardAuth)
    || (/\?handoff=/.test(dashboardAuth) && /handoffCallbackPath\(query\.handoff\)/.test(examsHome)));
});

test("Dashboard category PATCH matches the Exams preflight contract", () => {
  const dashboardApi = readFileSync(new URL("../dashboard/utils/ExamsApiUtils.ts", import.meta.url), "utf8");
  const examsCors = readFileSync(new URL("./management-cors.ts", import.meta.url), "utf8");
  assert.match(dashboardApi, /method:\s*"PATCH"/);
  assert.match(examsCors, /GET, POST, PUT, PATCH, DELETE, OPTIONS/);
});

test("Backend callback errors match the Exams callback allowlist", () => {
  const backend = readFileSync(new URL("../../../Dashboard-Backend/src/main/java/me/reid/restful/routes/CentralAuthRoutes.java", import.meta.url), "utf8");
  const exams = readFileSync(new URL("../../app/exams/api/auth/callback/route.ts", import.meta.url), "utf8");
  for (const code of ["cancelled", "provider_failure"]) {
    assert.match(backend, new RegExp(`"${code}"`));
    assert.match(exams, new RegExp(`"${code}"`));
  }
  assert.match(exams, /invalid_handoff/);
});

test("central auth cannot issue an Exams handoff before current policy acceptance", () => {
  const service = readFileSync(new URL("../../../Dashboard-Backend/src/main/java/me/reid/auth/CentralAuthService.java", import.meta.url), "utf8");
  const routes = readFileSync(new URL("../../../Dashboard-Backend/src/main/java/me/reid/restful/routes/CentralAuthRoutes.java", import.meta.url), "utf8");
  const exams = readFileSync(new URL("../../app/exams/api/auth/callback/route.ts", import.meta.url), "utf8");

  assert.match(service, /CONSENT_REQUIRED/);
  assert.match(service, /acceptConsent/);
  assert.match(service, /exchangeHandoff[\s\S]*policy/i);
  assert.match(routes, /\/auth\/consent/);
  for (const code of ["consent_declined", "invalid_consent", "consent_expired"]) {
    assert.match(routes, new RegExp(`"${code}"`));
    assert.match(exams, new RegExp(`"${code}"`));
  }
});
