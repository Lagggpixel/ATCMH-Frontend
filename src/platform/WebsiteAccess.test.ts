import assert from "node:assert/strict";
import test from "node:test";
import {observeWebsiteReturns, sendWebsiteAccess} from "./WebsiteAccess";

test("cached pageshow and visible-tab return report access and cleanup listeners", () => {
  const page = new EventTarget();
  const document = Object.assign(new EventTarget(), {visibilityState: "hidden"});
  let reports = 0;
  const cleanup = observeWebsiteReturns(page as Window, document as unknown as Document, () => {reports++;});
  page.dispatchEvent(Object.assign(new Event("pageshow"), {persisted: false}));
  document.dispatchEvent(new Event("visibilitychange"));
  assert.equal(reports, 0);
  page.dispatchEvent(Object.assign(new Event("pageshow"), {persisted: true}));
  document.visibilityState = "visible";
  document.dispatchEvent(new Event("visibilitychange"));
  assert.equal(reports, 2);
  cleanup();
  document.dispatchEvent(new Event("visibilitychange"));
  assert.equal(reports, 2);
});

test("client access beacon carries no explicit IP, token or URL payload", async () => {
  const originalFetch = globalThis.fetch;
  let options: RequestInit | undefined;
  let endpoint: unknown;
  globalThis.fetch = async (input, init) => {endpoint = input; options = init; return new Response(null, {status: 204});};
  try {
    sendWebsiteAccess();
    assert.equal(endpoint, "/api/access");
    assert.deepEqual(options, {method: "POST", credentials: "same-origin", cache: "no-store", keepalive: true});
  } finally {globalThis.fetch = originalFetch;}
});
