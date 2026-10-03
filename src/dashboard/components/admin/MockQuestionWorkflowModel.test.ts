import assert from "node:assert/strict";
import test from "node:test";
import {bankCountError, bankUsage, emptyMockQuestion, questionDraft, questionError, setupErrors} from "./MockQuestionWorkflowModel";
import {resolveDashboardRoute} from "../../route-map";
import type {MockQuestionBank, MockQuestionSlot} from "../../types/MockQuestionTemplate";

const banks: MockQuestionBank[] = [{id: 1, name: "Transition", questions: [1, 2].map(id => ({...emptyMockQuestion(), id, questionText: `Question ${id}`, active: true, attachments: []}))}];
const draw: MockQuestionSlot = {kind: "BANK", bankId: 1};
const manual: MockQuestionSlot = {kind: "MANUAL", question: {...emptyMockQuestion(), questionText: "Manual exact"}};

test("bank capacity counts every occurrence including draws separated by manual questions", () => {
    assert.equal(bankUsage([draw, manual, draw]).get(1), 2);
    assert.deepEqual(setupErrors([draw, manual, draw], banks), [undefined, undefined, undefined]);
    assert.deepEqual(setupErrors([draw, manual, draw, draw], banks), ["Only 2 questions available", undefined, "Only 2 questions available", "Only 2 questions available"]);
});
test("missing and empty banks cannot produce a ready setup", () => {
    assert.equal(setupErrors([draw], [])[0], "Question bank is unavailable");
    assert.equal(setupErrors([draw], [{...banks[0], questions: []}])[0], "At least 1 question required in this bank");
});
test("count accepts whole numbers within remaining capacity only", () => {
    for (const value of [0, -1, 1.5, NaN, Infinity]) assert.equal(bankCountError(value, 2), "Select at least 1 question");
    assert.equal(bankCountError(2, 2), undefined);
    assert.equal(bankCountError(3, 2), "Only 2 questions remaining");
    assert.equal(bankCountError(1, 0), "Only 0 questions remaining");
});
test("manual authoring validates required text and model-answer limits", () => {
    assert.equal(questionError(emptyMockQuestion()), "Question text is required");
    assert.equal(questionError({...emptyMockQuestion(), questionText: " \n "}), "Question text is required");
    assert.equal(questionError({...emptyMockQuestion(), questionText: "x".repeat(2001)}), "Question text must be 2000 characters or fewer");
    assert.equal(questionError({...manual.question!, modelAnswer: "x".repeat(8001)}), "Model answer must be 8000 characters or fewer");
});
test("draft copying preserves existing attachment references and new file payloads", () => {
    const question = {...emptyMockQuestion(), id: 3, attachments: [{id: 1, filename: "saved.png", contentType: "image/png"}, {filename: "new.png", contentType: "image/png", dataBase64: "AQID"}]};
    assert.deepEqual(JSON.parse(JSON.stringify(questionDraft(question))), question);
    assert.notEqual(questionDraft(question).attachments, question.attachments);
});
test("banks are a separate dashboard route in the mock questions feature", () => {
    assert.deepEqual(resolveDashboardRoute("/dashboard/mock-questions"), {screen: "mock-questions"});
    assert.deepEqual(resolveDashboardRoute("/dashboard/mock-questions/banks"), {screen: "mock-questions"});
    assert.deepEqual(resolveDashboardRoute("/dashboard/mock-questions/banks/unknown"), {screen: "not-found"});
});
