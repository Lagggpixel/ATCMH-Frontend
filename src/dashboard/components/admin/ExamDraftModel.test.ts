import assert from "node:assert/strict";
import test from "node:test";
import type {ManagedExamQuiz} from "../../types/Exam.ts";
import {firstInvalidQuestion, moveExamQuestion, validateExamDraft} from "./ExamDraftModel.ts";

const validDraft = (): ManagedExamQuiz => ({
    title: "Ground Control", description: "", category: "Ground", feedbackMode: "after_submission",
    timeLimitSeconds: 0, tags: [], isPrivate: true, randomizeQuestions: false,
    questions: [
        {prompt: "First prompt", randomizeOptions: false, options: [{text: "A", isCorrect: true}, {text: "B", isCorrect: false}]},
        {prompt: "Second prompt", randomizeOptions: false, options: [{text: "C", isCorrect: true}, {text: "D", isCorrect: false}]},
    ],
});

test("validation checks inactive questions before a quiz can save", () => {
    const draft = validDraft();
    draft.questions[1].options[1].text = "";
    const issues = validateExamDraft(draft, "folder-id");
    assert.equal(issues.length, 1);
    assert.equal(issues[0].path, "questions[1].options[1]");
    assert.equal(firstInvalidQuestion(issues), 1);
});

test("validation requires one correct answer and a canonical folder", () => {
    const draft = validDraft();
    draft.questions[0].options[1].isCorrect = true;
    const issues = validateExamDraft(draft, "");
    assert.deepEqual(issues.map(issue => issue.path), ["category", "questions[0].options"]);
});

test("moving questions changes order without mutating the original draft", () => {
    const draft = validDraft();
    const reordered = moveExamQuestion(draft.questions, 0, 1);
    assert.equal(reordered[0].prompt, "Second prompt");
    assert.equal(reordered[1].prompt, "First prompt");
    assert.equal(draft.questions[0].prompt, "First prompt");
    assert.equal(moveExamQuestion(draft.questions, 0, -1), draft.questions);
});
