import type {ExamFeedbackMode, ExamQuizSummary} from "../types/Exam.ts";

export type ExamVisibilityFilter = "all" | "public" | "private";

export interface ExamQuizFolder {
    name: string;
    quizzes: ExamQuizSummary[];
}

const normalizeCategory = (value?: string | null) => value?.trim() ?? "";

const folderName = (category?: string | null) => normalizeCategory(category) || "Uncategorized";

export const groupExamQuizzes = (quizzes: ExamQuizSummary[]): ExamQuizFolder[] => {
    const folders = new Map<string, ExamQuizSummary[]>();
    for (const quiz of quizzes) {
        const name = folderName(quiz.category);
        const current = folders.get(name) ?? [];
        current.push(quiz);
        folders.set(name, current);
    }
    return [...folders.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, folderQuizzes]) => ({name, quizzes: folderQuizzes}));
};

export const filterExamQuizzes = (
    quizzes: ExamQuizSummary[],
    query: string,
    category: string,
    visibility: ExamVisibilityFilter,
) => {
    const normalizedQuery = query.trim().toLowerCase();
    const normalizedCategory = normalizeCategory(category);
    return quizzes.filter(quiz => {
        const searchable = [quiz.title, quiz.description ?? "", normalizeCategory(quiz.category)].join(" ").toLowerCase();
        const matchesCategory = normalizedCategory === "all" || normalizeCategory(quiz.category) === normalizedCategory;
        const matchesVisibility = visibility === "all" || (visibility === "private" ? quiz.isPrivate : !quiz.isPrivate);
        return (!normalizedQuery || searchable.includes(normalizedQuery)) && matchesCategory && matchesVisibility;
    });
};

export const getExamCategories = (quizzes: ExamQuizSummary[]) =>
    [...new Set(quizzes.map(quiz => normalizeCategory(quiz.category)).filter(Boolean))].sort((a, b) => a.localeCompare(b));

export const formatExamFeedback = (mode?: ExamFeedbackMode) => ({
    after_submission: "After submission",
    after_each_question: "After each question",
    none: "No feedback",
}[mode ?? "none"]);

export const formatExamUpdatedAt = (value?: string | null) => {
    if (!value) return "Not recorded";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Not recorded";
    return new Intl.DateTimeFormat("en-US", {month: "short", day: "numeric", year: "numeric", timeZone: "UTC"}).format(date);
};
