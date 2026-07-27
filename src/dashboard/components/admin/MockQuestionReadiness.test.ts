import assert from "node:assert/strict";
import test from "node:test";
import {mockQuestionReadiness} from "./MockQuestionReadiness.ts";

test("any positive mock question count is ready to send", () => {
    for (const count of [1, 2, 3, 4, 12]) {
        const readiness = mockQuestionReadiness(count);

        assert.equal(readiness.ready, true);
        assert.match(readiness.message, new RegExp(`Ready: ${count} mock question`));
        assert.match(readiness.message, /Discord can send this set in order\./);
    }
});

test("zero mock questions is explicitly unavailable", () => {
    assert.deepEqual(mockQuestionReadiness(0), {
        ready: false,
        message: "Unavailable: no mock questions are configured. Add at least one question before sending from Discord.",
    });
});
