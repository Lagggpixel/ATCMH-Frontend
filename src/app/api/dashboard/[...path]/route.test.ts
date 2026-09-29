import assert from "node:assert/strict";
import test from "node:test";
import {GET, PUT} from "./route";

test("relay supplies only its derived access marker and cannot proxy internal routes", async () => {
  const previous = {...process.env};
  const originalFetch = globalThis.fetch;
  const forwarded: Request[] = [];
  process.env.DASHBOARD_API_URL = "https://backend.test";
  process.env.FRONTEND_PUBLIC_ORIGIN = "https://www.atcmh.org";
  process.env.EXAMS_AUTH_KEY = "internal-secret";
  globalThis.fetch = async (input, init) => {forwarded.push(new Request(input, init)); return Response.json({ok: true});};
  try {
    const request = new Request("https://www.atcmh.org/api/dashboard/admin/me", {headers: {"X-Exams-Auth-Key": "attacker", "X-Atcmh-Access-Reported": "attacker", cookie: "__Host-atcmh_session=session"}});
    await GET(request, {params: Promise.resolve({path: ["admin", "me"]})});
    assert.equal(forwarded[0].headers.get("X-Exams-Auth-Key"), null);
    assert.match(forwarded[0].headers.get("X-Atcmh-Access-Reported")!, /^[a-f0-9]{64}$/);
    assert.equal(forwarded[0].headers.get("cookie"), "__Host-atcmh_session=session");
    for (const path of [["internal", "auth"], ["internal/auth"], ["admin", "..", "internal"]]) {
      assert.equal((await GET(request, {params: Promise.resolve({path})})).status, 404);
    }
    assert.equal(forwarded.length, 1);
    const revision = "2026-09-29T10:11:12.123Z";
    await PUT(new Request("https://www.atcmh.org/api/dashboard/admin/courses/course-1", {method: "PUT", headers: {"If-Match": revision}}), {params: Promise.resolve({path: ["admin", "courses", "course-1"]})});
    assert.equal(forwarded[1].headers.get("If-Match"), revision);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of ["DASHBOARD_API_URL", "FRONTEND_PUBLIC_ORIGIN", "EXAMS_AUTH_KEY"]) {
      if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    }
  }
});
