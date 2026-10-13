import assert from "node:assert/strict";
import {test} from "node:test";
import {ApiUtils, configureDashboardApiUrl} from "./ApiUtils";

test("saved feedback reads never generate AI and refresh writes carry CSRF and explicit force", async () => {
    const original = globalThis.fetch;
    const requests: {url: string; options?: RequestInit}[] = [];
    configureDashboardApiUrl("https://example.test/api/dashboard");
    globalThis.fetch = async (url, options) => {requests.push({url: String(url), options}); return new Response(JSON.stringify({status: "NOT_GENERATED"}));};
    try {
        await ApiUtils.getSessionFeedback(42);
        await ApiUtils.getRecentTrainingFeedback(7);
        assert.equal(requests.length, 2);
        assert.ok(requests.every(request => request.options?.method === "GET"));
        assert.ok(requests.every(request => request.options?.credentials === "include"));
        await ApiUtils.generateSessionFeedback(42, "csrf", false);
        await ApiUtils.generateSessionFeedback(42, "csrf", true);
        assert.match(requests[2].url, /forceRefresh=false$/); assert.match(requests[3].url, /forceRefresh=true$/);
        assert.equal(requests[3].options?.method, "POST");
        assert.equal(new Headers(requests[3].options?.headers).get("X-CSRF-Token"), "csrf");
        globalThis.fetch = async () => new Response("{}", {status: 403});
        assert.equal(await ApiUtils.generateSessionFeedback(42, "csrf", true), undefined);
    } finally {globalThis.fetch = original; configureDashboardApiUrl("https://dashboard-api.atcmh.org");}
});
