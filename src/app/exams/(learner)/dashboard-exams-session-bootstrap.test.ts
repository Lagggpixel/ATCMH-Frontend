import assert from "node:assert/strict";
import test from "node:test";

import {configureDashboardApiUrl} from "@/src/dashboard/utils/ApiUtils";
import {ExamsApiUtils} from "@/src/dashboard/utils/ExamsApiUtils";
import {bootstrapDashboardExamsSession} from "./dashboard-exams-session-bootstrap";

const dashboardSession = {accountId: "account-1", application: "dashboard" as const, expiresAt: "2026-07-16T00:00:00Z", csrfToken: "dashboard-csrf", impersonating: false, identities: []};
const examSession = {accountId: "account-1", discordId: "mentor-1", expiresAt: "2026-07-16T00:00:00Z", csrfToken: "exams-csrf", impersonating: false};

test.beforeEach(() => {
  configureDashboardApiUrl("https://dashboard-api.example.test");
  ExamsApiUtils.clearSessionCache();
});
test.afterEach(() => ExamsApiUtils.clearSessionCache());

test("leaves an existing Exams session alone", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Request[] = [];
  globalThis.fetch = async (input, init) => {
    const request = new Request(new URL(String(input), "https://www.atcmh.org"), init);
    requests.push(request);
    if (request.url.endsWith("/exams/api/auth/session")) return Response.json({session: examSession});
    throw new Error(`Unexpected request: ${request.url}`);
  };
  try {
    assert.equal(await bootstrapDashboardExamsSession(), "existing-exams-session");
  } finally { globalThis.fetch = originalFetch; }
  assert.equal(requests.length, 1);
});

test("does nothing for an anonymous visitor", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Request[] = [];
  globalThis.fetch = async (input, init) => {
    const request = new Request(new URL(String(input), "https://www.atcmh.org"), init);
    requests.push(request);
    if (request.url.endsWith("/exams/api/auth/session")) return Response.json({session: null});
    if (request.url.endsWith("/auth/me")) return new Response(null, {status: 401});
    throw new Error(`Unexpected request: ${request.url}`);
  };
  try {
    assert.equal(await bootstrapDashboardExamsSession(), "anonymous");
  } finally { globalThis.fetch = originalFetch; }
  assert.equal(requests.length, 2);
});

test("uses one Dashboard handoff to create the missing Exams session", async () => {
  const originalFetch = globalThis.fetch;
  let sessionReads = 0;
  let handoffs = 0;
  let callbacks = 0;
  globalThis.fetch = async (input, init) => {
    const request = new Request(new URL(String(input), "https://www.atcmh.org"), init);
    if (request.url.endsWith("/exams/api/auth/session")) {
      sessionReads += 1;
      return Response.json({session: sessionReads >= 3 ? examSession : null});
    }
    if (request.url.endsWith("/auth/me")) return Response.json(dashboardSession);
    if (request.url.endsWith("/auth/handoffs/exams")) {
      handoffs += 1;
      assert.equal(request.headers.get("X-CSRF-Token"), "dashboard-csrf");
      return Response.json({handoff: "h".repeat(43)});
    }
    if (request.url.includes("/exams/api/auth/callback?")) {
      callbacks += 1;
      return new Response(null, {status: 204});
    }
    throw new Error(`Unexpected request: ${request.url}`);
  };
  try {
    assert.equal(await bootstrapDashboardExamsSession(), "bridged");
  } finally { globalThis.fetch = originalFetch; }
  assert.equal(handoffs, 1);
  assert.equal(callbacks, 1);
  assert.equal(sessionReads, 3);
});

test("surfaces a retryable failure only after confirming a Dashboard session", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const request = new Request(new URL(String(input), "https://www.atcmh.org"), init);
    if (request.url.endsWith("/exams/api/auth/session")) return Response.json({session: null});
    if (request.url.endsWith("/auth/me")) return Response.json(dashboardSession);
    if (request.url.endsWith("/auth/handoffs/exams")) return new Response("Unavailable", {status: 503, statusText: "Service Unavailable"});
    throw new Error(`Unexpected request: ${request.url}`);
  };
  try {
    await assert.rejects(() => bootstrapDashboardExamsSession(), /could not be connected to the Exams Center/);
  } finally { globalThis.fetch = originalFetch; }
});
