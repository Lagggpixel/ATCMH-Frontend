import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname, join} from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "AdminMockQuestions.tsx"), "utf8");

test("mock question editor exposes all required template fields and snapshot guidance", () => {
    assert.match(source, /Question text/);
    assert.match(source, /Example \/ model answer/);
    assert.match(source, /Discord attachments/);
    assert.match(source, /Order/);
    assert.match(source, /future sends only/);
    assert.match(source, /official Infinite Flight ATC Manual/);
});

test("mock question editor gates itself on the dedicated capability", () => {
    assert.match(source, /canManageMockQuestions/);
    assert.match(source, /Mentors, Moderators, and Super Admins/);
});

test("mock question editor sends all configured questions and delegates readiness to the count policy", () => {
    assert.match(source, /Discord sends every configured question in this order\./);
    assert.match(source, /mockQuestionReadiness\(ordered\.length\)/);
    assert.doesNotMatch(source, /first three|exactly three|\/3 questions configured/);
});
