import assert from "node:assert/strict";
import test from "node:test";
import {ApiUtils, configureDashboardApiUrl} from "./ApiUtils";

const state = {applicationType: "mentor", status: "DRAFT", answers: {region: "Europe"}, applicationId: "app-1", version: 3};

test("application APIs use the shared question order and cookie-backed CSRF mutations", async () => {
    configureDashboardApiUrl("https://dashboard-api.test");
    const originalFetch = globalThis.fetch;
    const requests: Request[] = [];
    globalThis.fetch = async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        if (request.url.endsWith("/applications/questions")) return Response.json([]);
        return Response.json(state);
    };
    try {
        await ApiUtils.getApplicationQuestions();
        await ApiUtils.getCurrentApplication("mentor");
        await ApiUtils.saveCurrentApplication("csrf", "mentor", {region: "Europe"});
        await ApiUtils.submitCurrentApplication("csrf", "mentor", {region: "Europe"});
    } finally {
        globalThis.fetch = originalFetch;
    }
    assert.deepEqual(requests.map(request => new URL(request.url).pathname), [
        "/applications/questions", "/applications/current", "/applications/current", "/applications/current/submit",
    ]);
    assert.equal(new URL(requests[1].url).searchParams.get("type"), "mentor");
    assert.equal(requests[0].credentials, "include");
    assert.equal(requests[1].headers.get("X-CSRF-Token"), null);
    assert.equal(requests[2].method, "PUT");
    assert.equal(requests[2].headers.get("X-CSRF-Token"), "csrf");
    assert.deepEqual(await requests[2].json(), {applicationType: "mentor", answers: {region: "Europe"}});
    assert.equal(requests[3].method, "POST");
    assert.equal(requests[3].headers.get("X-CSRF-Token"), "csrf");
});

test("application state normalizes backend boolean and numeric answers for form controls", async () => {
    configureDashboardApiUrl("https://dashboard-api.test");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => Response.json({...state, answers: {commitment: true, appliedIfatc: false, attemptCount: 2}});
    try {
        assert.deepEqual((await ApiUtils.getCurrentApplication("mentor")).answers, {
            commitment: "yes", appliedIfatc: "no", attemptCount: "2",
        });
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("Discord restart sends the expected draft identity and version for atomic invalidation", async () => {
    configureDashboardApiUrl("https://dashboard-api.test");
    const originalFetch = globalThis.fetch;
    let request: Request | undefined;
    globalThis.fetch = async (input, init) => {
        request = new Request(input, init);
        return Response.json({status: "RESTART_DISCORD", discordUrl: "https://discord.test/apply", message: "Start again in Discord."});
    };
    try {
        const result = await ApiUtils.restartApplicationInDiscord("csrf", state as never);
        assert.equal(result.discordUrl, "https://discord.test/apply");
    } finally {
        globalThis.fetch = originalFetch;
    }
    assert.equal(new URL(request!.url).pathname, "/applications/current/restart-discord");
    assert.equal(request!.headers.get("X-CSRF-Token"), "csrf");
    assert.deepEqual(await request!.json(), {applicationType: "mentor", expectedApplicationId: "app-1", expectedVersion: 3});
});

test("application question management remains a separate moderator capability", async () => {
    configureDashboardApiUrl("https://dashboard-api.test");
    const originalFetch = globalThis.fetch;
    const requests: Request[] = [];
    globalThis.fetch = async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json(request.method === "GET" ? [] : {key: "region", prompt: "Where?", helpText: null, inputType: "TEXT", sortOrder: 10, active: true, dependsOnKey: null, dependsOnValue: null});
    };
    try {
        await ApiUtils.getManagedApplicationQuestions("csrf");
        await ApiUtils.updateApplicationQuestion("csrf", "region", {prompt: "Where?", helpText: null, sortOrder: 10, active: true});
    } finally {
        globalThis.fetch = originalFetch;
    }
    assert.equal(new URL(requests[0].url).pathname, "/admin/application-questions");
    assert.equal(requests[0].headers.get("X-CSRF-Token"), null);
    assert.equal(new URL(requests[1].url).pathname, "/admin/application-questions/region");
    assert.equal(requests[1].headers.get("X-CSRF-Token"), "csrf");
});
