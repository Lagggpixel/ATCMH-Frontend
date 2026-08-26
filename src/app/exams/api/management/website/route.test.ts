import assert from "node:assert/strict";
import test from "node:test";

import { PUT } from "./route";
import { csrfTokenFor } from "@/src/lib/central-auth";

const originalFetch = globalThis.fetch;
const token = "t".repeat(43);

function authorizeWithDiscordRoles(roles: string[]) {
  process.env.DASHBOARD_API_URL = "https://dashboard-api.atcmh.org";
  process.env.EXAMS_AUTH_KEY = "auth-key";
  process.env.EXAMS_CSRF_SECRET = "x".repeat(32);
  process.env.FRONTEND_PUBLIC_ORIGIN = "https://www.atcmh.org";
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/internal/auth/sessions/introspect")) return Response.json({ active: true, accountId: "1", discordId: "123456789012345", expiresAt: "2099-01-01T00:00:00Z", impersonating: false });
    return Response.json({ capabilities: roles.includes("admin-role") ? ["manage-system"] : ["manage-exams"], canManageAll: roles.includes("admin-role") });
  };
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("website PUT rejects a mentor before parsing the request", async () => {
  authorizeWithDiscordRoles(["mentor-role"]);
  const request = new Request("https://www.atcmh.org/exams/api/management/website", {
    method: "PUT",
    headers: { cookie: `__Host-atcmh_session=${token}`, origin: "https://www.atcmh.org", "X-CSRF-Token": csrfTokenFor(token), "Content-Type": "application/json" },
    body: "not JSON",
  });

  const response = await PUT(request);

  assert.equal(response.status, 403);
});
