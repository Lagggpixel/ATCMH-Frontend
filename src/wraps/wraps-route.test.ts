import assert from "node:assert/strict";
import test from "node:test";
import {NextRequest} from "next/server";
import type {NextFetchEvent} from "next/server";
import {proxy} from "@/src/proxy";

const event = {waitUntil: () => {}} as unknown as NextFetchEvent;
function configureTestOrigins() {
    const keys = ["DASHBOARD_API_URL", "FRONTEND_PUBLIC_ORIGIN"] as const;
    const previous = keys.map(key => process.env[key]);
    process.env.DASHBOARD_API_URL = "http://localhost:3001";
    process.env.FRONTEND_PUBLIC_ORIGIN = "http://localhost:3000";
    return () => keys.forEach((key, index) => {
        if (previous[index] === undefined) delete process.env[key];
        else process.env[key] = previous[index];
    });
}
test("unauthorized wraps requests are real HTTP 404s before any page is streamed", async () => {
    const original = globalThis.fetch;
    const restoreOrigins = configureTestOrigins();
    try {
        for (const role of ["admin", "staff", "mentor", "member"]) {
            globalThis.fetch = async input => Response.json(new URL(String(input)).pathname === "/auth/me"
                ? {accountId: "123", application: "web", impersonating: false, expiresAt: "2099-01-01"}
                : {id: "456", role});
            const request = new NextRequest("http://localhost:3000/wraps", {headers: {cookie: "atcmh_session=opaque"}});
            const response = await proxy(request, event);
            assert.equal(response.status, 404);
            assert.equal(await response.text(), "Not found");
            assert.match(response.headers.get("cache-control") ?? "", /private, no-store/);
            assert.match(response.headers.get("x-robots-tag") ?? "", /noindex/);
        }
        const guest = await proxy(new NextRequest("http://localhost:3000/wraps"), event);
        assert.equal(guest.status, 404);
    } finally { globalThis.fetch = original; restoreOrigins(); }
});

test("super admins can reach wraps; other routes retain their normal proxy behavior", async () => {
    const original = globalThis.fetch;
    const restoreOrigins = configureTestOrigins();
    try {
        globalThis.fetch = async input => Response.json(new URL(String(input)).pathname === "/auth/me"
            ? {accountId: "123", application: "web", impersonating: false, expiresAt: "2099-01-01"}
            : {id: "456", role: "super_admin"});
        const response = await proxy(new NextRequest("http://localhost:3000/wraps", {headers: {cookie: "atcmh_session=opaque"}}), event);
        assert.equal(response.status, 200);
        assert.equal(response.headers.get("x-middleware-next"), "1");
        assert.match(response.headers.get("cache-control") ?? "", /private, no-store/);
        const home = await proxy(new NextRequest("http://localhost:3000/"), event);
        assert.equal(home.status, 200);
        assert.equal(home.headers.get("x-middleware-next"), "1");
    } finally { globalThis.fetch = original; restoreOrigins(); }
});
