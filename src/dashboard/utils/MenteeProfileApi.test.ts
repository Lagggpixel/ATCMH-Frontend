import test from "node:test";
import assert from "node:assert/strict";
import {ApiUtils, configureDashboardApiUrl} from "./ApiUtils.ts";

test("profile save sends all fields to the exact mentee record and returns refreshed data", async () => {
    const original = globalThis.fetch;
    configureDashboardApiUrl("https://example.test/api/dashboard");
    const profile = {region: "Europe", timezone: "Europe/London", availability: "Monday: Not available"};
    globalThis.fetch = async (input, init) => {
        assert.equal(String(input), "https://example.test/api/dashboard/admin/mentees/42/profile");
        assert.equal(init?.method, "PUT");
        assert.equal(init?.credentials, "include");
        assert.deepEqual(JSON.parse(String(init?.body)), profile);
        return Response.json({id: 42, ...profile});
    };
    try { assert.deepEqual(await ApiUtils.updateMenteeProfile(null, 42, profile), {id: 42, ...profile}); }
    finally { globalThis.fetch = original; configureDashboardApiUrl("https://dashboard-api.atcmh.org"); }
});

test("profile save reports server validation errors", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => Response.json({error: "Invalid weekly availability"}, {status: 400});
    try {
        await assert.rejects(ApiUtils.updateMenteeProfile(null, 42, {region: "Europe", timezone: "UTC", availability: "bad"}), /Invalid weekly availability/);
    } finally { globalThis.fetch = original; }
});
