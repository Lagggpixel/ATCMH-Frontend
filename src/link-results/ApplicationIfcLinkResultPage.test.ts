/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {createServer, type ViteDevServer} from "vite";

let vite: ViteDevServer;
const root = new URL("../..", import.meta.url).pathname;
test.before(async () => { vite = await createServer({root, resolve: {alias: {"@": root}}, appType: "custom", server: {middlewareMode: true}, logLevel: "silent"}); });
test.after(async () => { await vite.close(); });
const loadPage = async () => (await vite.ssrLoadModule("/src/link-results/ApplicationIfcLinkResultPage.tsx") as {default: React.ComponentType<any>}).default;

test("access denied honestly covers denial, closing, and backing out", async () => {
  const Page = await loadPage();
  const html = renderToStaticMarkup(React.createElement(Page, {result: {
    outcome: "cancelled_or_not_approved",
    attemptReference: "application-ifc-oauth:41",
  }}));

  assert.match(html, /cancelled or not approved/i);
  assert.match(html, /selected Deny/i);
  assert.match(html, /closed the authorization page/i);
  assert.match(html, /went back/i);
  assert.match(html, /application-ifc-oauth:41/);
  assert.match(html, /Return to Discord/);
});
test("every verified outcome has a clear heading, explanation, and next action", async () => {
  const Page = await loadPage();
  for (const outcome of ["linked", "temporarily_unavailable", "login_required", "interaction_required", "provider_failure", "invalid_attempt", "link_conflict", "persistence_failure"]) {
    const html = renderToStaticMarkup(React.createElement(Page, {result: {
      outcome,
      attemptReference: "application-ifc-oauth:42",
      ...(outcome === "linked" ? {applicationType: "written"} : {}),
    }}));
    assert.match(html, /<h1[^>]*>/);
    assert.match(html, /<section[^>]*role="(?:status|alert)"/);
    assert.match(html, outcome === "linked" ? /Continue application/ : /Return to Discord/);
    assert.doesNotMatch(html, /access_token|providerError|oauth state|pkce|nonce|192\.0\.2\./i);
  }
});

test("invalid or unsigned result input renders generic safe recovery without a reference", async () => {
  const Page = await loadPage();
  const html = renderToStaticMarkup(React.createElement(Page, {}));
  assert.match(html, /result is invalid or expired/i);
  assert.match(html, /Return to Discord/);
  assert.doesNotMatch(html, /Attempt reference|application-ifc-oauth/);
});

test("public route uses the unified shell and hardened result presentation", () => {
  const route = readFileSync(new URL("../app/link-results/page.tsx", import.meta.url), "utf8");
  const proxy = readFileSync(new URL("../proxy.ts", import.meta.url), "utf8");
  const css = readFileSync(new URL("./ApplicationIfcLinkResultPage.module.css", import.meta.url), "utf8");
  assert.match(route, /<SiteFrame><ApplicationIfcLinkResultPage result=\{result\}\/><\/SiteFrame>/);
  assert.match(route, /readApplicationIfcLinkResult/);
  assert.match(route, /APPLICATION_IFC_RESULT_SECRET/);
  assert.doesNotMatch(route, /NEXT_PUBLIC_.*RESULT_SECRET/);
  assert.match(proxy, /pathname === "\/link-results"/);
  assert.match(proxy, /Cache-Control", "private, no-store/);
  assert.match(proxy, /Referrer-Policy", "no-referrer/);
  assert.match(proxy, /X-Robots-Tag", "noindex, nofollow, noarchive/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media \(max-width:/);
});
