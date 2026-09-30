import test from "node:test";
import assert from "node:assert/strict";
import {createServer, type ViteDevServer} from "vite";
import {fileURLToPath} from "node:url";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import type {AccountDetail, AccountSummary} from "../../types/Account";

let vite: ViteDevServer;
let AccountResultsTable: React.ComponentType<{accounts: AccountSummary[]; selectedId?: string; onOpen: (id: string) => void}>;
let AccountOverview: React.ComponentType<{account: AccountDetail; canViewIpAddresses: boolean}>;
test.before(async () => {
    const root = fileURLToPath(new URL("../../../..", import.meta.url));
    vite = await createServer({appType: "custom", root, resolve: {alias: {"@": root}}, server: {middlewareMode: true}, logLevel: "silent"});
    ({AccountResultsTable, AccountOverview} = await vite.ssrLoadModule("/src/dashboard/components/admin/AdminAccounts.tsx"));
});
test.after(async () => { await vite.close(); });
const account = (patch: Partial<AccountSummary> = {}): AccountSummary => ({
    id: "1620948573017264183", status: "ACTIVE", version: 1, createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-01T10:00:00Z",
    identities: [{provider: "discord", subject: "1234567890123456789", displayName: "CaptainAlex", active: true}], ...patch,
});
const render = (accounts: AccountSummary[], selectedId?: string) => renderToStaticMarkup(React.createElement(AccountResultsTable, {accounts, selectedId, onOpen: () => {}}));

test("account directory keeps full IDs and exposes selection on a keyboard-accessible control", () => {
    const html = render([account()], "1620948573017264183");
    assert.match(html, /aria-label="View CaptainAlex, account 1620948573017264183" aria-current="true"/);
    assert.match(html, /Account ID: 1620948573017264183/);
    assert.match(html, /data-selected="true"/);
    assert.match(html, /scope="col">Discord identity/);
});

test("directory provider columns show active identities even when archived ones come first", () => {
    const html = render([account({identities: [
        {provider: "DISCORD", subject: "old-subject", displayName: "ArchivedPilot", active: false},
        {provider: "discord", subject: "active-subject", displayName: "CaptainAlex", active: true},
        {provider: "IFC", subject: "ifc-subject", displayName: "CAPALEX"},
    ]})]);
    assert.doesNotMatch(html, /ArchivedPilot|old-subject/);
    assert.match(html, /active-subject/);
    assert.match(html, /CAPALEX/);
    assert.match(html, /ifc-subject/);
});

test("unresolved names and missing providers retain useful identity and status information", () => {
    const html = render([account({status: "MERGED", identities: [{provider: "discord", subject: "verified-subject", displayName: "N/A"}]}), account({id: "7", status: "DELETED", identities: []})]);
    assert.match(html, /View verified-subject, account/);
    assert.match(html, /Unlinked account/);
    assert.match(html, /Not linked/);
    assert.match(html, /Merged<\/span>/);
    assert.match(html, /Deleted<\/span>/);
    assert.doesNotMatch(html, />N\/A</);
});

test("overview derives last login from backend timestamps and respects the IP capability", () => {
    const detail: AccountDetail = {...account(), sessions: [], linkHistory: [], managementAudits: [], loginHistory: [{createdAt: "2026-09-29T10:00:00Z"}, {createdAt: "2026-10-01T11:00:00Z"}, {createdAt: "invalid"}], ipAddresses: [{ip: "203.0.113.1",firstSeen: "2026-09-29T10:00:00Z",lastSeen: "2026-09-29T10:00:00Z",count: 1},{ip: "203.0.113.2",firstSeen: "2026-10-01T10:00:00Z",lastSeen: "2026-10-01T10:00:00Z",count: 1}]};
    const hidden = renderToStaticMarkup(React.createElement(AccountOverview, {account: detail, canViewIpAddresses: false}));
    assert.doesNotMatch(hidden, /203\.0\.113|Last seen IP|Invalid Date|No recorded logins/);
    assert.ok(hidden.includes(new Date("2026-10-01T11:00:00Z").toLocaleString()));
    const visible = renderToStaticMarkup(React.createElement(AccountOverview, {account: detail, canViewIpAddresses: true}));
    assert.match(visible, /Last seen IP/);
    assert.match(visible, /203\.0\.113\.2/);
    assert.doesNotMatch(visible, /203\.0\.113\.1/);
});
