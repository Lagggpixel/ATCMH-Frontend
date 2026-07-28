import test from "node:test";
import assert from "node:assert/strict";
import {ApiUtils, configureDashboardApiUrl} from "./ApiUtils.ts";

test("alt evidence API scopes reviews and sends CSRF-protected rescan requests", async () => {
    const originalFetch = globalThis.fetch;
    const requests: Request[] = [];
    configureDashboardApiUrl("https://dashboard.test");
    globalThis.fetch = async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        if (request.method === "POST") return Response.json({id: "scan-1", accountId: "42", state: "RUNNING", total: 2, completed: 0, failed: 0, truncated: false, startedAt: "2026-07-28T00:00:00Z"}, {status: 202});
        if (request.url.includes("/rescans/")) return Response.json({id: "scan-1", accountId: "42", state: "COMPLETED", total: 2, completed: 2, failed: 0, truncated: false, startedAt: "2026-07-28T00:00:00Z"});
        return Response.json({candidates: [], suppressions: [], selectedAccountId: "42"});
    };
    try {
        await ApiUtils.getAltAccounts("csrf", "42");
        await ApiUtils.startAltEvidenceRescan("csrf", "42");
        await ApiUtils.getAltEvidenceRescan("csrf", "scan-1");
    } finally {
        globalThis.fetch = originalFetch;
        configureDashboardApiUrl("https://dashboard-api.atcmh.org");
    }

    assert.equal(new URL(requests[0].url).searchParams.get("accountId"), "42");
    assert.equal(requests[1].method, "POST");
    assert.equal(requests[1].headers.get("X-CSRF-Token"), "csrf");
    assert.deepEqual(await requests[1].json(), {accountId: "42"});
    assert.equal(requests[2].method, "GET");
});
