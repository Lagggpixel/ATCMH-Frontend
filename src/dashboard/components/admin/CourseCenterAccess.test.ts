import test from "node:test";
import assert from "node:assert/strict";
import type {ExamManagementActor} from "../../types/Exam.ts";
import {canAccessCourseCenterView, type CourseCenterView} from "./CourseCenterAccess.ts";

const views: CourseCenterView[] = ["courses", "course-preview", "course-create", "course-edit", "course-stats"];

test("mentor course capability grants only the catalog and preview, including direct routes", () => {
    const mentor: ExamManagementActor = {discordId: "mentor", canManageAll: false, capabilities: ["manage-exams", "preview-courses"]};
    for (const view of views) {
        assert.equal(canAccessCourseCenterView(view, mentor), view === "courses" || view === "course-preview", view);
    }
});

test("course managers retain every workspace and unrelated quiz permissions grant none", () => {
    const manager: ExamManagementActor = {discordId: "manager", canManageAll: true, capabilities: ["manage-courses"]};
    const quizManager: ExamManagementActor = {discordId: "quiz-manager", canManageAll: false, capabilities: ["manage-exams"]};
    for (const view of views) {
        assert.equal(canAccessCourseCenterView(view, manager), true, view);
        assert.equal(canAccessCourseCenterView(view, quizManager), false, view);
    }
});
