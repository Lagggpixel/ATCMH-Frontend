import test from "node:test";
import assert from "node:assert/strict";
import {ApiUtils} from "./ApiUtils.ts";

const withFetch = async (response: Response, run: () => Promise<void>) => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => response;

    try {
        await run();
    } finally {
        globalThis.fetch = originalFetch;
    }
};

test("getAdminUser distinguishes authorized, unauthenticated, and forbidden responses", async () => {
    await withFetch(new Response(JSON.stringify({
        id: "123",
        username: "Mentor",
        canManageAllAssignments: false,
        canViewAuditLogs: false,
        canViewManual: false,
    }), {status: 200}), async () => {
        const result = await ApiUtils.getAdminUser("token");

        assert.equal(result.status, "authorized");
        assert.equal(result.user.username, "Mentor");
        assert.equal(result.user.canViewManual, false);
    });

    await withFetch(new Response(JSON.stringify({error: "Unauthorized"}), {status: 401}), async () => {
        assert.deepEqual(await ApiUtils.getAdminUser("token"), {status: "unauthenticated"});
    });

    await withFetch(new Response(JSON.stringify({error: "Forbidden"}), {status: 403}), async () => {
        assert.deepEqual(await ApiUtils.getAdminUser("token"), {status: "forbidden"});
    });
});

test("admin data requests surface unauthorized responses as errors", async () => {
    await withFetch(new Response(JSON.stringify({error: "Forbidden"}), {
        status: 403,
        statusText: "Forbidden",
    }), async () => {
        await assert.rejects(
            () => ApiUtils.getSessions("token"),
            /failed with 403 Forbidden/
        );
    });
});

test("getAuditLogs forwards explicit all limit", async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = "";
    globalThis.fetch = async (input) => {
        requestedUrl = String(input);
        return new Response(JSON.stringify([]), {status: 200});
    };

    try {
        await ApiUtils.getAuditLogs("token", {limit: "all"});
    } finally {
        globalThis.fetch = originalFetch;
    }

    assert.equal(new URL(requestedUrl).searchParams.get("limit"), "all");
});

test("getAuditLogFilters loads the authorized audit filter metadata", async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = "";
    globalThis.fetch = async (input) => {
        requestedUrl = String(input);
        return new Response(JSON.stringify({
            sources: ["dashboard", "exams"],
            actions: ["exam.attempt.started"],
            targetTypes: ["attempt"],
            actors: [{id: "123", name: "Learner"}],
        }), {status: 200});
    };

    try {
        const result = await ApiUtils.getAuditLogFilters("token");
        assert.deepEqual(result, {
            sources: ["dashboard", "exams"],
            actions: ["exam.attempt.started"],
            targetTypes: ["attempt"],
            actors: [{id: "123", name: "Learner"}],
        });
    } finally {
        globalThis.fetch = originalFetch;
    }

    assert.equal(new URL(requestedUrl).pathname, "/admin/audit-log-filters");
});

test("session restoration and mutations use opaque cookies plus CSRF instead of bearer tokens", async () => {
    const originalFetch = globalThis.fetch;
    const requests: Request[] = [];
    globalThis.fetch = async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        if (request.url.endsWith("/auth/me")) return new Response(JSON.stringify({accountId: "1", status: "active", application: "dashboard", expiresAt: "2026-07-14T00:00:00Z", csrfToken: "csrf", impersonating: false, identities: []}), {status: 200});
        return new Response(JSON.stringify({ok: true}), {status: 200});
    };
    try {
        const session = await ApiUtils.getAuthSession();
        assert.equal(session?.status, "ACTIVE");
        await ApiUtils.logout("csrf");
    } finally {
        globalThis.fetch = originalFetch;
    }
    assert.equal(requests[0].credentials, "include");
    assert.equal(requests[0].headers.get("Authorization"), null);
    assert.equal(requests[1].credentials, "include");
    assert.equal(requests[1].headers.get("X-CSRF-Token"), "csrf");
    assert.equal(requests[1].headers.get("Authorization"), null);
});

test("consent context uses the backend-owned HttpOnly challenge cookie", async () => {
    const originalFetch = globalThis.fetch;
    let request: Request | undefined;
    globalThis.fetch = async (input, init) => {
        request = new Request(input, init);
        return Response.json({
            application: "exams",
            expiresAt: "2026-07-14T12:10:00Z",
            csrfToken: "csrf-value",
            terms: {version: "2026-07-14", url: "https://www.atcmh.org/terms"},
            privacy: {version: "2026-07-14.1", url: "https://www.atcmh.org/policy"},
        });
    };

    try {
        const context = await ApiUtils.getConsentContext();
        assert.equal(context?.application, "exams");
        assert.equal(context?.csrfToken, "csrf-value");
    } finally {
        globalThis.fetch = originalFetch;
    }

    assert.equal(new URL(request!.url).pathname, "/auth/consent/context");
    assert.equal(request!.credentials, "include");
    assert.equal(request!.headers.get("Authorization"), null);
    assert.equal(request!.method, "GET");
});

test("missing or expired consent context is a safe empty result", async () => {
    await withFetch(Response.json({error: "Invalid or expired consent"}, {status: 400}), async () => {
        assert.equal(await ApiUtils.getConsentContext(), null);
    });
});
