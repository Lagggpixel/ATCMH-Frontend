import type {ExamManagementActor} from "../../types/Exam.ts";

export type ExamCenterView = "catalog" | "create" | "edit" | "import" | "unlocks" | "attempts" | "attempt-review" | "website";

const hasCapability = (actor: ExamManagementActor, capability: ExamManagementActor["capabilities"][number]) =>
    actor.capabilities.includes(capability);

/** Website records are global content, never a mentor workspace. */
export const canManageExamWebsite = (actor: ExamManagementActor) => actor.canManageAll;

export const canAccessExamCenterView = (view: ExamCenterView, actor: ExamManagementActor) => {
    switch (view) {
        case "create":
        case "edit":
            return hasCapability(actor, "manage-exams");
        case "import":
            return hasCapability(actor, "import-exams");
        case "unlocks":
            return hasCapability(actor, "unlock-learners");
        case "attempts":
        case "attempt-review":
            return hasCapability(actor, "review-attempts");
        case "website":
            return canManageExamWebsite(actor);
        case "catalog":
            return true;
    }
};

export const isCurrentExamQuiz = (examId: string | undefined, requestedId: string | null) =>
    Boolean(examId && requestedId === examId);

export const quizVisibilityReason = (actor: ExamManagementActor) =>
    `Visible through your Discord ${actor.canManageAll ? "administrator" : "mentor"} quiz-management permission.`;
