import test from "node:test";
import assert from "node:assert/strict";
import {createServer, type ViteDevServer} from "vite";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";

let vite: ViteDevServer;
const root = new URL("../../../..", import.meta.url).pathname;

test.before(async () => {
    vite = await createServer({appType: "custom", root, resolve: {alias: {"@": root}}, server: {middlewareMode: true}, logLevel: "silent"});
});
test.after(async () => { await vite.close(); });

test("evidence grouping keeps exact matches first and network candidates together", async () => {
    const {groupAltEvidence} = await vite.ssrLoadModule("/src/dashboard/components/admin/AdminAltAccounts.tsx") as any;
    const groups = groupAltEvidence([
        {evidenceType: "NETWORK_SIMILARITY", accounts: ["1", "2"], network: "198.51.100.0/24"},
        {evidenceType: "VPN_INDICATOR", accounts: ["3"], ip: "192.0.2.4"},
        {evidenceType: "SAME_IP", accounts: ["1", "4"], ip: "203.0.113.9"},
        {evidenceType: "NETWORK_SIMILARITY", accounts: ["5", "6"], network: "2001:db8::/64"},
    ]);
    assert.deepEqual([...groups.keys()], ["SAME_IP", "VPN_INDICATOR", "NETWORK_SIMILARITY", "OWNERSHIP_CONFLICT"]);
    assert.equal(groups.get("SAME_IP").length, 1);
    assert.equal(groups.get("NETWORK_SIMILARITY").length, 2);
});

test("safe display labels evidence as review signals without making identity determinations", async () => {
    const {ReviewSignalNotice} = await vite.ssrLoadModule("/src/dashboard/components/admin/AdminAltAccounts.tsx") as any;
    const html = renderToStaticMarkup(React.createElement(ReviewSignalNotice));
    assert.match(html, /Review signals, not determinations/);
    assert.match(html, /does not prove dynamic allocation/);
    assert.match(html, /same person/);
    assert.doesNotMatch(html, /is the same person|proves VPN use|confirmed dynamic/i);
});

test("rescan status shows bounded progress, result, and truncation honestly", async () => {
    const {RescanStatus} = await vite.ssrLoadModule("/src/dashboard/components/admin/AdminAltAccounts.tsx") as any;
    const running = renderToStaticMarkup(React.createElement(RescanStatus, {scan: {id: "s", accountId: "42", state: "RUNNING", total: 8, completed: 3, failed: 1, truncated: false, startedAt: ""}}));
    assert.match(running, /3 of 8 addresses checked/);
    const done = renderToStaticMarkup(React.createElement(RescanStatus, {scan: {id: "s", accountId: "42", state: "COMPLETED", total: 100, completed: 100, failed: 2, truncated: true, startedAt: ""}}));
    assert.match(done, /100 most recent addresses/);
    assert.doesNotMatch(done, /203\.0\.113|provider/i);
});
