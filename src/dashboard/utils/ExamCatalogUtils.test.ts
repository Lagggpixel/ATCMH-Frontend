import test from "node:test";
import assert from "node:assert/strict";
import type {ExamQuizSummary} from "../types/Exam.ts";
import {
    filterExamQuizzes,
    formatExamFeedback,
    formatExamUpdatedAt,
    getExamCategories,
    groupExamQuizzes,
} from "./ExamCatalogUtils.ts";

const quizzes: ExamQuizSummary[] = [
    {id: "tower", title: "Tower Essentials", description: "Runway control", category: "Tower", feedbackMode: "after_submission", isPrivate: false, updatedAt: "2026-07-08T10:30:00Z"},
    {id: "ground", title: "Ground Operations", description: "Taxi routing", category: "Ground", feedbackMode: "none", isPrivate: true, updatedAt: null},
];

test("catalog search matches title, description, and category case-insensitively", () => {
    assert.deepEqual(filterExamQuizzes(quizzes, "runway", "all", "all").map(quiz => quiz.id), ["tower"]);
    assert.deepEqual(filterExamQuizzes(quizzes, "GROUND", "all", "all").map(quiz => quiz.id), ["ground"]);
});

test("catalog filters category and visibility together", () => {
    assert.deepEqual(filterExamQuizzes(quizzes, "", "Ground", "private").map(quiz => quiz.id), ["ground"]);
    assert.deepEqual(filterExamQuizzes(quizzes, "", "Tower", "private"), []);
});

test("catalog category matching trims both quiz values and selected options", () => {
    const spaced = [{...quizzes[0], category: "  Tower  "}];
    assert.deepEqual(getExamCategories(spaced), ["Tower"]);
    assert.deepEqual(filterExamQuizzes(spaced, "", " Tower ", "all").map(quiz => quiz.id), ["tower"]);
});

test("catalog search lowercasing is locale independent", () => {
    const original = String.prototype.toLocaleLowerCase;
    String.prototype.toLocaleLowerCase = function () {
        throw new Error("locale-sensitive lowercasing must not be used");
    };
    try {
        assert.doesNotThrow(() => {
            assert.deepEqual(filterExamQuizzes(quizzes, "TOWER", "all", "all").map(quiz => quiz.id), ["tower"]);
        });
    } finally {
        String.prototype.toLocaleLowerCase = original;
    }
});

test("catalog categories are unique and sorted", () => {
    assert.deepEqual(getExamCategories([...quizzes, {...quizzes[0], id: "tower-2"}]), ["Ground", "Tower"]);
});

test("groups quizzes into normalized mentor folders", () => {
    const grouped = groupExamQuizzes([
        {...quizzes[0], id: "reid-1", category: " Mentor Reid "},
        {...quizzes[1], id: "alex-1", category: "Mentor Alex"},
        {...quizzes[0], id: "reid-2", category: "Mentor Reid"},
        {...quizzes[1], id: "none", category: "  "},
    ]);

    assert.deepEqual(grouped.map(folder => [folder.name, folder.quizzes.map(quiz => quiz.id)]), [
        ["Mentor Alex", ["alex-1"]],
        ["Mentor Reid", ["reid-1", "reid-2"]],
        ["Uncategorized", ["none"]],
    ]);
});

test("filters before grouping so empty folders disappear", () => {
    const visible = filterExamQuizzes(quizzes, "ground", "all", "all");
    assert.deepEqual(groupExamQuizzes(visible).flatMap(folder => folder.quizzes.map(quiz => quiz.id)), ["ground"]);
});

test("catalog formats feedback and update values for staff", () => {
    assert.equal(formatExamFeedback("after_submission"), "After submission");
    assert.equal(formatExamFeedback("after_each_question"), "After each question");
    assert.equal(formatExamFeedback("none"), "No feedback");
    assert.equal(formatExamUpdatedAt(null), "Not recorded");
    assert.equal(formatExamUpdatedAt("2026-07-08T10:30:00Z"), "Jul 8, 2026");
});
