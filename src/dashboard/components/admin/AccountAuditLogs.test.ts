import test from "node:test";
import assert from "node:assert/strict";
import {createServer, type ViteDevServer} from "vite";
import {fileURLToPath} from "node:url";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import type {AuditLog} from "../../types/AuditLog";

let vite: ViteDevServer;
let Entries: React.ComponentType<{logs: AuditLog[]}>;
test.before(async () => {
    const root = fileURLToPath(new URL("../../../..", import.meta.url));
    vite = await createServer({cacheDir: `${root}/build/vite-audit-tests/${process.pid}`, appType: "custom", root, resolve: {alias: {"@": root}}, server: {middlewareMode: true, watch: null}, logLevel: "silent"});
    ({AccountAuditLogEntries: Entries} = await vite.ssrLoadModule("/src/dashboard/components/admin/AccountAuditLogs.tsx"));
});
test.after(async () => {await vite.close();});

test("account audit entries expose time, actor, source, target and expandable structured details", () => {
    const log: AuditLog = {id: 73, createdAt: Date.parse("2026-11-14T12:00:00Z"), source: "discord", actorId: "789885863848443964", actorName: "Syncline", action: "mentee.pickup", targetType: "mentee", targetId: "1234567890123456789", summary: "Mentor picked up mentee", detailsJson: '{"reason":"review"}'};
    const html = renderToStaticMarkup(React.createElement(Entries, {logs: [log]}));
    assert.match(html, /<details>/);
    assert.match(html, /mentee\.pickup/);
    assert.match(html, /Syncline · 789885863848443964/);
    assert.match(html, /Mentor picked up mentee/);
    assert.match(html, /1234567890123456789/);
    assert.match(html, /review/);
});

test("system events and malformed legacy details render safely without HTML injection", () => {
    const html = renderToStaticMarkup(React.createElement(Entries, {logs: [{id: 1, createdAt: 0, source: "system", action: "test", summary: "<script>bad()</script>", detailsJson: "<img src=x onerror=bad()>"}]}));
    assert.match(html, /System/);
    assert.match(html, /&lt;script&gt;/);
    assert.match(html, /&lt;img/);
    assert.doesNotMatch(html, /<script>|<img/);
});

test("empty account audit history is explicit", () => {
    const html = renderToStaticMarkup(React.createElement(Entries, {logs: []}));
    assert.match(html, /No audit logs recorded for this account/);
});
