import assert from "node:assert/strict";
import test from "node:test";
import type {PilotGuide} from "@/src/learning/pilot-guide";
import {configureDashboardApiUrl} from "./ApiUtils";
import {PilotGuideApiUtils, PilotGuideRequestError} from "./PilotGuideApiUtils";

const guide: PilotGuide = {
    title: "Pilot Guide", introduction: "Training session instructions.", lastUpdated: "2026-02-02",
    revision: 3, updatedAt: "2026-10-02T12:00:00Z",
    chapters: [{id: "getting-started", title: "Getting started", html: "<p>Current content.</p>"}],
};

test("guide management uses cookie-backed reads and CSRF-protected versioned writes", async () => {
    configureDashboardApiUrl("https://dashboard-api.test");
    const originalFetch = globalThis.fetch;
    const requests: Request[] = [];
    const saved = {...guide, revision: 4, updatedAt: "2026-10-02T12:01:00Z", chapters: [{...guide.chapters[0], html: "<p>Server-normalized content.</p>"}]};
    globalThis.fetch = async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json({guide: request.method === "GET" ? guide : saved});
    };
    try {
        assert.deepEqual(await PilotGuideApiUtils.getGuide("session-csrf"), guide);
        assert.deepEqual(await PilotGuideApiUtils.saveGuide(guide, "session-csrf"), saved);
    } finally { globalThis.fetch = originalFetch; }
    assert.deepEqual(requests.map(request => request.url), Array(2).fill("https://dashboard-api.test/admin/pilot-guide"));
    assert.equal(requests[0].credentials, "include");
    assert.equal(requests[0].cache, "no-store");
    assert.equal(requests[0].headers.get("X-CSRF-Token"), null);
    assert.equal(requests[1].method, "PUT");
    assert.equal(requests[1].credentials, "include");
    assert.equal(requests[1].headers.get("X-CSRF-Token"), "session-csrf");
    assert.equal(requests[1].headers.get("If-Match"), '"3"');
    assert.deepEqual(await requests[1].json(), {
        title: guide.title, introduction: guide.introduction, lastUpdated: guide.lastUpdated, chapters: guide.chapters,
    });
});

test("save conflicts retain the draft and expose status without automatically overwriting", async () => {
    const originalFetch = globalThis.fetch;
    let requests = 0;
    const before = structuredClone(guide);
    globalThis.fetch = async () => { requests++; return Response.json({error: "Conflict"}, {status: 409}); };
    try {
        await assert.rejects(PilotGuideApiUtils.saveGuide(guide, "csrf"), error => error instanceof PilotGuideRequestError && error.status === 409 && /changed/.test(error.message));
        assert.equal(requests, 1);
        assert.deepEqual(guide, before);
    } finally { globalThis.fetch = originalFetch; }
});

test("expired sessions and unauthorized management remain explicit failures", async () => {
    const originalFetch = globalThis.fetch;
    try {
        for (const status of [401, 403]) {
            globalThis.fetch = async () => Response.json({error: "Denied"}, {status});
            await assert.rejects(PilotGuideApiUtils.getGuide("csrf"), error => error instanceof PilotGuideRequestError && error.status === status);
        }
    } finally { globalThis.fetch = originalFetch; }
});

test("missing CSRF and invalid revisions stop before a save request is sent", async () => {
    const originalFetch = globalThis.fetch;
    let requests = 0;
    globalThis.fetch = async () => { requests++; return Response.json({guide}); };
    try {
        await assert.rejects(PilotGuideApiUtils.saveGuide(guide, " "), error => error instanceof PilotGuideRequestError && error.status === 401);
        await assert.rejects(PilotGuideApiUtils.saveGuide({...guide, revision: -1}, "csrf"), /revision is invalid/);
        assert.equal(requests, 0);
    } finally { globalThis.fetch = originalFetch; }
});

test("successful HTTP responses with malformed guide content are rejected", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => Response.json({guide: {...guide, chapters: "invalid"}});
    try { await assert.rejects(PilotGuideApiUtils.getGuide("csrf"), /invalid guide data/); }
    finally { globalThis.fetch = originalFetch; }
});
