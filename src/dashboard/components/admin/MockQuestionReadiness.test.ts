import assert from "node:assert/strict";
import test from "node:test";
import {mockQuestionReadiness} from "./MockQuestionReadiness.ts";

test("any positive mock question count is ready to send", () => {
    for (const count of [1, 2, 3, 4, 12]) {
        const readiness = mockQuestionReadiness(count);

        assert.equal(readiness.ready, true);
        assert.equal(readiness.message, "Ready");
    }
});

test("zero mock questions is explicitly unavailable", () => {
    assert.deepEqual(mockQuestionReadiness(0), {
        ready: false,
        message: "Needs attention",
    });
});
