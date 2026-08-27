import test from "node:test";
import assert from "node:assert/strict";
import type {ExamCategory, ExamQuizSummary} from "../types/Exam.ts";
import {
    filterExamQuizzes,
    formatExamFeedback,
    formatExamUpdatedAt,
    getExamCategoryOptions,
    getExamCategories,
    groupExamQuizzes,
} from "./ExamCatalogUtils.ts";

const quizzes: ExamQuizSummary[] = [
    {id: "tower", categoryId: "tower-folder", title: "Tower Essentials", description: "Runway control", category: "Tower", feedbackMode: "after_submission", isPrivate: false, updatedAt: "2026-07-08T10:30:00Z"},
    {id: "ground", categoryId: "ground-folder", title: "Ground Operations", description: "Taxi routing", category: "Ground", feedbackMode: "none", isPrivate: true, updatedAt: null},
];

test("catalog search matches title, description, and category case-insensitively", () => {
    assert.deepEqual(filterExamQuizzes(quizzes, "runway", "all", "all").map(quiz => quiz.id), ["tower"]);
    assert.deepEqual(filterExamQuizzes(quizzes, "GROUND", "all", "all").map(quiz => quiz.id), ["ground"]);
});

test("catalog filters category and visibility together", () => {
    assert.deepEqual(filterExamQuizzes(quizzes, "", "ground-folder", "private").map(quiz => quiz.id), ["ground"]);
    assert.deepEqual(filterExamQuizzes(quizzes, "", "tower-folder", "private"), []);
});

test("catalog category matching trims both quiz values and selected options", () => {
    const spaced = [{...quizzes[0], categoryId: null, category: "  Tower  "}];
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
        {...quizzes[0], id: "reid-1", categoryId: null, category: " Mentor Reid "},
        {...quizzes[1], id: "alex-1", categoryId: null, category: "Mentor Alex"},
        {...quizzes[0], id: "reid-2", categoryId: null, category: "Mentor Reid"},
        {...quizzes[1], id: "none", categoryId: null, category: "  "},
    ]);

    assert.deepEqual(grouped.map(folder => [folder.name, folder.quizzes.map(quiz => quiz.id)]), [
        ["Mentor Alex", ["alex-1"]],
        ["Mentor Reid", ["reid-1", "reid-2"]],
        ["Uncategorized", ["none"]],
    ]);
});

test("filters before grouping when no managed folders are supplied", () => {
    const visible = filterExamQuizzes(quizzes, "ground", "all", "all");
    assert.deepEqual(groupExamQuizzes(visible).flatMap(folder => folder.quizzes.map(quiz => quiz.id)), ["ground"]);
});

test("seeds every managed folder, including empty folders", () => {
    const categories: ExamCategory[] = Array.from({length: 15}, (_, index) => ({
        id: `folder-${index + 1}`,
        name: `Folder ${String(index + 1).padStart(2, "0")}`,
        parentId: null,
    }));
    const managedQuizzes = categories.slice(0, 10).map((category, index): ExamQuizSummary => ({
        id: `quiz-${index + 1}`,
        categoryId: category.id,
        category: category.name,
        title: `Quiz ${index + 1}`,
        isPrivate: true,
    }));

    const grouped = groupExamQuizzes(managedQuizzes, categories);

    assert.equal(grouped.length, 15);
    assert.equal(grouped.filter(folder => folder.quizzes.length === 0).length, 5);
});

test("keeps same-name folders separate by canonical category id", () => {
    const categories: ExamCategory[] = [
        {id: "folder-a", name: "Mock Set", parentId: null},
        {id: "folder-b", name: "Mock Set", parentId: "folder-a"},
    ];
    const grouped = groupExamQuizzes([
        {...quizzes[0], id: "quiz-a", categoryId: "folder-a", category: "Mock Set"},
        {...quizzes[1], id: "quiz-b", categoryId: "folder-b", category: "Mock Set"},
    ], categories);

    assert.deepEqual(grouped.map(folder => [folder.id, folder.quizzes[0]?.id]), [
        ["folder-a", "quiz-a"],
        ["folder-b", "quiz-b"],
    ]);
    const options = getExamCategoryOptions(quizzes, categories);
    assert.deepEqual(options.map(option => option.id), ["ground-folder", "folder-a", "folder-b", "tower-folder"]);
    assert.deepEqual(options.filter(option => option.id.startsWith("folder-")).map(option => option.name), ["Mock Set", "Mock Set / Mock Set"]);
});

test("catalog formats feedback and update values for staff", () => {
    assert.equal(formatExamFeedback("after_submission"), "After submission");
    assert.equal(formatExamFeedback("after_each_question"), "After each question");
    assert.equal(formatExamFeedback("none"), "No feedback");
    assert.equal(formatExamUpdatedAt(null), "Not recorded");
    assert.equal(formatExamUpdatedAt("2026-07-08T10:30:00Z"), "Jul 8, 2026");
});
