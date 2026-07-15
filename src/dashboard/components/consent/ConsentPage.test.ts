/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {createServer, type ViteDevServer} from "vite";

const render = (component: React.ReactElement) => renderToStaticMarkup(component);
let vite: ViteDevServer;
const root = new URL("../../../..", import.meta.url).pathname;
test.before(async () => { vite = await createServer({root, resolve: {alias: {"@": root}}, appType: "custom", server: {middlewareMode: true}, logLevel: "silent"}); });
test.after(async () => { await vite.close(); });
const loadView = async () => (await vite.ssrLoadModule("/src/dashboard/components/consent/ConsentPage.tsx") as {ConsentPageView: React.ComponentType<any>}).ConsentPageView;

const context = {
    application: "exams" as const,
    expiresAt: "2026-07-14T12:10:00Z",
    csrfToken: "csrf-value",
    terms: {version: "2026-07-14", url: "https://www.atcmh.org/terms"},
    privacy: {version: "2026-07-14.1", url: "https://www.atcmh.org/policy"},
};

test("Dashboard exposes consent as a public route", () => {
    const app = readFileSync(new URL("../../../app/consent/page.tsx", import.meta.url), "utf8");
    assert.match(app, /<SiteFrame><ConsentPageContent\/><\/SiteFrame>/);
});

test("consent view renders safe loading and invalid states", async () => {
    const ConsentPageView = await loadView();
    assert.match(render(React.createElement(ConsentPageView, {state: {kind: "loading"}})), /Loading policy agreement/);
    const invalid = render(React.createElement(ConsentPageView, {state: {kind: "invalid"}}));
    assert.match(invalid, /agreement request is invalid or has expired/i);
    assert.match(invalid, /loginFor=dashboard/);
    assert.match(invalid, /loginFor=exams/);
    assert.doesNotMatch(invalid, /stack|exception|challenge/i);
    const unavailable = render(React.createElement(ConsentPageView, {state: {kind: "unavailable"}}));
    assert.match(unavailable, /could not load the policy agreement/i);
    assert.match(unavailable, /loginFor=dashboard/);
    assert.match(unavailable, /loginFor=exams/);
    assert.doesNotMatch(unavailable, /failed with|dashboard-api/i);
});

test("ready consent view renders the exact native form contract without a challenge", async () => {
    const ConsentPageView = await loadView();
    const html = render(React.createElement(ConsentPageView, {state: {kind: "ready", context}}));

    assert.match(html, /<form[^>]*action="https:\/\/dashboard-api\.atcmh\.org\/auth\/consent"[^>]*method="post"/);
    assert.match(html, /<input type="hidden" name="csrf" value="csrf-value"\/>/);
    assert.match(html, /<input (?=[^>]*type="checkbox")(?=[^>]*name="agreement")(?=[^>]*value="agreed")(?=[^>]*required="")[^>]*\/>/);
    assert.doesNotMatch(html, /checked=""/);
    assert.match(html, /I agree to the <a[^>]*>Terms of Service<\/a> and acknowledge the <a[^>]*>Privacy Policy<\/a>\./);
    assert.match(html, /href="https:\/\/www\.atcmh\.org\/terms"/);
    assert.match(html, /href="https:\/\/www\.atcmh\.org\/policy"/);
    assert.match(html, /<button (?=[^>]*class="[^"]*acceptButton[^"]*")(?=[^>]*type="submit")(?=[^>]*name="action")(?=[^>]*value="accept")[^>]*>Agree and continue<\/button>/);
    assert.match(html, /<button (?=[^>]*class="[^"]*declineButton[^"]*")(?=[^>]*type="submit")(?=[^>]*name="action")(?=[^>]*value="decline")(?=[^>]*formNoValidate="")[^>]*>Decline<\/button>/);
    assert.doesNotMatch(html, /name="challenge"|consentChallenge|__Host-atcmh_consent/);
});

test("completion failure stays retryable and only displays a validated request ID", async () => {
    const ConsentPageView = await loadView();
    const notice = {message: "We could not complete sign-in. Please try again.", requestId: "123e4567-e89b-42d3-a456-426614174000"};
    const html = render(React.createElement(ConsentPageView, {state: {kind: "ready", context}, notice}));
    assert.match(html, /We could not complete sign-in/);
    assert.match(html, /123e4567-e89b-42d3-a456-426614174000/);
    assert.match(html, /Agree and continue/);
});

test("consent policy links and actions have explicit accessible affordances", async () => {
    const ConsentPageView = await loadView();
    const html = render(React.createElement(ConsentPageView, {state: {kind: "ready", context}}));
    const css = readFileSync(new URL("./ConsentPage.module.css", import.meta.url), "utf8");

    assert.match(html, /<a[^>]*>Terms of Service<\/a>/);
    assert.match(html, /<a[^>]*>Privacy Policy<\/a>/);
    assert.match(css, /\.agreement a\s*\{[^}]*text-decoration:\s*underline/s);
    assert.match(css, /\.agreement a:hover\s*\{[^}]*text-decoration-thickness:/s);
    assert.match(css, /\.agreement a:focus-visible\s*\{[^}]*outline:/s);
    assert.match(css, /\.acceptButton\s*\{[^}]*background:\s*#2563eb[^}]*border-color:\s*#1d4ed8[^}]*color:\s*#fff/s);
    assert.match(css, /\.acceptButton:hover\s*\{[^}]*background:\s*#1d4ed8/s);
    assert.match(css, /\.acceptButton:focus-visible\s*\{[^}]*outline:/s);
    assert.match(css, /\.declineButton\s*\{[^}]*background:\s*transparent[^}]*border-color:\s*var\(--border-color\)/s);
    assert.match(css, /\.secondaryLink\s*\{[^}]*border:\s*1px solid var\(--border-color\)/s);
    assert.match(css, /\.declineButton:hover[^\{]*\{[^}]*background:/s);
    assert.match(css, /\.secondaryLink:hover[^\{]*\{[^}]*background:/s);
});
