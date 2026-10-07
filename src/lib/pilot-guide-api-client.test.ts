import assert from "node:assert/strict";
import test from "node:test";
import type {PilotGuide} from "@/src/learning/pilot-guide";
import {getPilotGuide} from "./pilot-guide-api-client";

const env = {DASHBOARD_API_URL: "https://dashboard-api.test/", FRONTEND_PUBLIC_ORIGIN: "https://www.atcmh.test/"};
const guide: PilotGuide = {
    title: "Pilot Guide", introduction: "Welcome.", lastUpdated: "2026-02-02", revision: 2,
    updatedAt: "2026-10-02T12:00:00Z", chapters: [{id: "start", title: "Getting started", html: "<p>Published content.</p>"}],
};

test("public reader loads current published content with the allowed origin and no session data", async () => {
    let request: Request | undefined;
    const result = await getPilotGuide(env, async (input, init) => {
        request = new Request(input, init);
        return Response.json({guide});
    });
    assert.deepEqual(result, guide);
    assert.equal(request!.url, "https://dashboard-api.test/pilot-guide");
    assert.equal(request!.headers.get("Origin"), "https://www.atcmh.test");
    assert.equal(request!.headers.get("Cookie"), null);
    assert.equal(request!.headers.get("Authorization"), null);
    assert.equal(request!.cache, "no-store");
});

test("public API failures and malformed data remain unavailable rather than serving seed or stale content", async () => {
    await assert.rejects(getPilotGuide(env, async () => Response.json({error: "Unavailable"}, {status: 503})), /unavailable \(503\)/);
    await assert.rejects(getPilotGuide(env, async () => Response.json({guide: {...guide, revision: "wrong"}})), /invalid guide data/);
});

test("public fetch validates configured origins before requesting content", async () => {
    let requests = 0;
    const fetchImpl = async () => { requests++; return Response.json({guide}); };
    for (const DASHBOARD_API_URL of ["http://remote.test", "https://user:password@remote.test", "https://remote.test/path"]) {
        await assert.rejects(getPilotGuide({...env, DASHBOARD_API_URL}, fetchImpl));
    }
    assert.equal(requests, 0);
});
