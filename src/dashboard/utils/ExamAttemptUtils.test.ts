import test from "node:test";
import assert from "node:assert/strict";
import type {ExamAttemptSummary} from "../types/Exam.ts";
import {filterExamAttempts, formatAttemptResult, formatAttemptStatus} from "./ExamAttemptUtils.ts";

const attempts: ExamAttemptSummary[] = [
    {id: "one", code: "tower-01", quizId: "tower", quizTitle: "Tower basics", studentName: "Avery Pilot", studentDiscordId: "123", score: 8, total: 10, percentage: 80, submittedAt: "2026-07-12T08:00:00Z", status: "submitted", submissionReason: "manual"},
    {id: "two", code: "ground-02", quizId: "ground", quizTitle: "Ground operations", studentName: "Legacy learner", studentDiscordId: null, score: 3, total: 8, percentage: 37.5, submittedAt: null, status: "timed_out", submissionReason: "timeout"},
];

test("filters attempts by learner, nullable Discord ID, quiz title, and code", () => {
    assert.deepEqual(filterExamAttempts(attempts, "avery").map(attempt => attempt.id), ["one"]);
    assert.deepEqual(filterExamAttempts(attempts, "123").map(attempt => attempt.id), ["one"]);
    assert.deepEqual(filterExamAttempts(attempts, "ground operations").map(attempt => attempt.id), ["two"]);
    assert.deepEqual(filterExamAttempts(attempts, "GROUND-02").map(attempt => attempt.id), ["two"]);
    assert.deepEqual(filterExamAttempts(attempts, "legacy").map(attempt => attempt.id), ["two"]);
});

test("formats stored result and timeout status for compact review rows", () => {
    assert.equal(formatAttemptResult(attempts[0]), "8 / 10 · 80%");
    assert.equal(formatAttemptResult(attempts[1]), "3 / 8 · 37.5%");
    assert.equal(formatAttemptStatus("submitted"), "Submitted");
    assert.equal(formatAttemptStatus("timed_out"), "Timed out");
});
