import assert from "node:assert/strict";
import test from "node:test";
import {POST} from "./route";

test("access beacon accepts the configured public origin behind internal reverse proxy", async () => {
  const previous = process.env.FRONTEND_PUBLIC_ORIGIN;
  process.env.FRONTEND_PUBLIC_ORIGIN = "https://www.atcmh.org";
  try {
    const response = await POST(new Request("http://frontend:3000/api/access", {method: "POST", headers: {origin: "https://www.atcmh.org", "sec-fetch-site": "same-origin"}}));
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal((await POST(new Request("http://frontend:3000/api/access", {method: "POST", headers: {origin: "https://other.test"}}))).status, 403);
  } finally {if (previous === undefined) delete process.env.FRONTEND_PUBLIC_ORIGIN; else process.env.FRONTEND_PUBLIC_ORIGIN = previous;}
});
