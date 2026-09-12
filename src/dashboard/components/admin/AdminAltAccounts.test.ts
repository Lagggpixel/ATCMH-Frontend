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

test("rescan status shows bounded progress, result, and truncation honestly", async () => {
    const {RescanStatus} = await vite.ssrLoadModule("/src/dashboard/components/admin/AdminAltAccounts.tsx") as any;
    const running = renderToStaticMarkup(React.createElement(RescanStatus, {scan: {id: "s", accountId: "42", state: "RUNNING", total: 8, completed: 3, failed: 1, truncated: false, startedAt: ""}}));
    assert.match(running, /3 of 8 addresses checked/);
    const done = renderToStaticMarkup(React.createElement(RescanStatus, {scan: {id: "s", accountId: "42", state: "COMPLETED", total: 100, completed: 100, failed: 2, truncated: true, startedAt: ""}}));
    assert.match(done, /100 most recent addresses/);
    assert.doesNotMatch(done, /203\.0\.113|provider/i);
});

test("redacted evidence stays actionable using opaque references without displaying them", async () => {
    const {EvidenceSections, AltEvidenceActions, addressTarget} = await vite.ssrLoadModule("/src/dashboard/components/admin/AdminAltAccounts.tsx") as any;
    const candidate = {evidenceType: "SAME_IP", accounts: ["7", "8"], addressRef: "opaque-address-token", rationale: "Shared address", firstSeen: "2026-09-07T00:00:00Z", lastSeen: "2026-09-07T00:00:00Z", count: 2};
    const html = renderToStaticMarkup(React.createElement(EvidenceSections, {candidates: [candidate], onSelect: () => {}, onAction: () => {}}));
    assert.match(html, /Hidden/);
    assert.match(html, /Detach account 7/);
    assert.match(html, /Mark IP as VPN/);
    assert.doesNotMatch(html, /opaque-address-token/);
    let action: any;
    const tree = AltEvidenceActions({candidate, onAction: (value: unknown) => {action = value;}});
    const buttons = tree.props.children[0];
    buttons[0].props.onClick({currentTarget: {}});
    assert.equal(action.addressRef, "opaque-address-token");
    assert.equal(action.accountId, "7");
    assert.equal(Object.hasOwn(action, "ip"), false);
    assert.deepEqual(addressTarget({ip: "203.0.113.2", addressRef: "opaque"}), {addressRef: "opaque"});
});

test("per-account IP list is visible only with the explicit IP capability", async () => {
    const {AccountIpAddresses} = await vite.ssrLoadModule("/src/dashboard/components/admin/AdminAccounts.tsx") as any;
    const addresses = [{ip: "203.0.113.8", firstSeen: "2026-09-07T00:00:00Z", lastSeen: "2026-09-07T01:00:00Z", count: 4}];
    assert.equal(renderToStaticMarkup(React.createElement(AccountIpAddresses, {addresses, canView: false})), "");
    const html = renderToStaticMarkup(React.createElement(AccountIpAddresses, {addresses, canView: true}));
    assert.match(html, /203\.0\.113\.8/);
    assert.match(html, /First seen/);
    assert.match(html, /Last seen/);
    assert.match(html, /<td>4<\/td>/);
});
