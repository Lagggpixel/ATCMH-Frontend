import type {ExamManagementActor} from "../../types/Exam.ts";

export type CourseCenterView = "courses" | "course-create" | "course-edit" | "course-preview" | "course-stats";

export const canAccessCourseCenterView = (_view: CourseCenterView, actor: ExamManagementActor) =>
    actor.capabilities.includes("manage-courses");
