import assert from "node:assert/strict";
import test from "node:test";

import {configureDashboardApiUrl} from "@/src/dashboard/utils/ApiUtils";
import {ExamsApiUtils} from "@/src/dashboard/utils/ExamsApiUtils";
import {bootstrapDashboardExamsSession} from "./dashboard-exams-session-bootstrap";

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
    assert.equal(await bootstrapDashboardExamsSession(), "existing-session");
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
    throw new Error(`Unexpected request: ${request.url}`);
  };
  try {
    assert.equal(await bootstrapDashboardExamsSession(), "anonymous");
  } finally { globalThis.fetch = originalFetch; }
  assert.equal(requests.length, 1);
});
