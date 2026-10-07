import assert from "node:assert/strict";
import test from "node:test";
import {ApiUtils, configureDashboardApiUrl} from "./ApiUtils";
import {emptyMockQuestion} from "../components/admin/MockQuestionWorkflowModel";

test("mock workflow mutations include revision and CSRF header with the correct routes", async () => {
    const original = globalThis.fetch;
    const calls: {url: string; init?: RequestInit}[] = [];
    configureDashboardApiUrl("https://mock.test");
    globalThis.fetch = async (input, init) => {
        calls.push({url: String(input), init});
        return new Response(JSON.stringify({revision: 2, banks: [], sequence: []}));
    };
    try {
        await ApiUtils.getMockQuestionWorkflow("test-csrf");
        await ApiUtils.saveMockSetup("test-csrf", 1, [{kind: "BANK", bankId: 3}]);
        await ApiUtils.saveMockBank("test-csrf", 1, null, "Transition", [{...emptyMockQuestion(), questionText: "Question"}]);
        await ApiUtils.saveMockBank("test-csrf", 1, 3, "Transition", []);
        await ApiUtils.deleteMockBank("test-csrf", 1, 3);
        assert.deepEqual(calls.map(call => [call.url, call.init?.method ?? "GET"]), [
            ["https://mock.test/admin/mock-questions", "GET"],
            ["https://mock.test/admin/mock-questions/setup", "PUT"],
            ["https://mock.test/admin/mock-questions/banks", "POST"],
            ["https://mock.test/admin/mock-questions/banks/3", "PUT"],
            ["https://mock.test/admin/mock-questions/banks/3", "DELETE"],
        ]);
        for (const call of calls.slice(1)) {
            assert.equal(new Headers(call.init?.headers).get("X-CSRF-Token"), "test-csrf");
            assert.equal(call.init?.credentials, "include");
            assert.equal(JSON.parse(String(call.init?.body)).revision, 1);
        }
    } finally {globalThis.fetch = original; configureDashboardApiUrl("https://dashboard-api.atcmh.org");}
});

test("mock workflow preserves conflict errors and reports expired authorization", async () => {
    const original = globalThis.fetch;
    try {
        globalThis.fetch = async () => new Response(JSON.stringify({error: "Reload before saving"}), {status: 409});
        await assert.rejects(ApiUtils.saveMockSetup("csrf", 0, []), /409.*Reload before saving/);
        globalThis.fetch = async () => new Response("", {status: 403});
        assert.equal(await ApiUtils.saveMockSetup("csrf", 0, []), undefined);
    } finally {globalThis.fetch = original;}
});
