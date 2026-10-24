import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {createServer, type ViteDevServer} from "vite";
import {fileURLToPath} from "node:url";
import type {RecentFeedback, SavedSessionFeedback, SessionRating} from "../../types/SessionFeedback";

let vite: ViteDevServer;
let Sessions: React.ComponentType<{rows: RecentFeedback[]}>;
test.before(async () => {
    const root = fileURLToPath(new URL("../../../..", import.meta.url));
    vite = await createServer({root, appType: "custom", resolve: {alias: {"@": root}}, ssr: {noExternal: ["@phosphor-icons/react"]}, server: {middlewareMode: true, watch: null}, logLevel: "silent"});
    ({RecentTrainingFeedbackSessions: Sessions} = await vite.ssrLoadModule("/src/dashboard/components/admin/RecentTrainingFeedback.tsx"));
});
test.after(async () => {await vite?.close();});

const ready = (categories = 7): SavedSessionFeedback => ({status: "READY", data: {
    sessionId: 42, threadUrl: "https://discord.com/channels/123/456", sourceMessages: 113, coverage: "private provider metadata",
    summary: {overview: {text: "Saved descriptive session summary."}, uncertainties: [], followUp: [{text: "Invented future recommendation."}], assessment: {
        context: "HELD", rubricVersion: "example", categories: Array.from({length: categories}, (_, index) => ({category: `Category ${index + 1}`, rating: "Not assessed" as SessionRating, confidence: .8})),
    }},
}});
const row = (feedback: SavedSessionFeedback, sessionId = 42): RecentFeedback => ({sessionId, airport: "SBBR", time: "2026-09-30T23:30:00-02:00", feedback});
const render = (rows: RecentFeedback[]) => renderToStaticMarkup(React.createElement(Sessions, {rows}));

test("renders the saved summary once, dynamic seven/eight-category rubrics and UTC dates without provider metadata or recommendations", () => {
    for (const count of [7, 8]) {
        const html = render([row(ready(count))]);
        assert.equal((html.match(/Saved descriptive session summary\./g) ?? []).length, 1);
        assert.equal((html.match(/scope="row"/g) ?? []).length, count);
        assert.match(html, /01 Oct 2026/);
        assert.match(html, /01:30/);
        assert.match(html, /datetime="2026-10-01T01:30:00.000Z"/i);
        assert.doesNotMatch(html, /Invented future|Focus for next|private provider|113|confidence/);
    }
});

test("opens the first saved result, keeps session navigation and exposes no generation or mutation control", () => {
    const html = render([row({status: "NOT_GENERATED"}, 41), row(ready())]);
    const details = html.match(/<details[^>]*>/g)!;
    assert.doesNotMatch(details[0], /open=/);
    assert.match(details[1], /open=/);
    assert.match(html, /href="\/dashboard\/sessions\?session=42"/);
    assert.match(html, /href="https:\/\/discord.com\/channels\/123\/456"/);
    assert.doesNotMatch(html, /Generate|Force refresh|Mark not held|<button/);
});

test("distinguishes missing, pending and unavailable feedback and handles READY without data", () => {
    const html = render([row({status: "NOT_GENERATED"}), row({status: "RUNNING"}, 43), row({status: "UNAVAILABLE"}, 44), row({status: "READY"}, 45)]);
    assert.match(html, /No saved feedback yet/);
    assert.match(html, /Feedback pending/);
    assert.equal((html.match(/>Feedback unavailable</g) ?? []).length, 2);
    assert.doesNotMatch(html, /<table/);
});

test("not-held feedback retains its descriptive summary without presenting a performance grade", () => {
    const feedback = ready();
    feedback.data!.summary.assessment!.context = "NOT_HELD";
    const html = render([row(feedback)]);
    assert.match(html, /Saved descriptive session summary/);
    assert.match(html, /No performance grade is assigned/);
    assert.doesNotMatch(html, /<table|Category 1/);
});

test("invalid assignment links are omitted and saved text is escaped", () => {
    const feedback = ready();
    feedback.data!.threadUrl = "https://example.test/channels/123/456";
    feedback.data!.summary.overview.text = "<script>bad()</script>";
    const html = render([row(feedback)]);
    assert.doesNotMatch(html, /Open assignment thread|example.test|<script>/);
    assert.match(html, /&lt;script&gt;/);
});
