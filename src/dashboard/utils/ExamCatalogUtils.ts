import type {ExamCategory, ExamFeedbackMode, ExamQuizSummary} from "../types/Exam.ts";

export type ExamVisibilityFilter = "all" | "public" | "private";

export interface ExamQuizFolder {
    id: string;
    name: string;
    parentId: string | null;
    quizzes: ExamQuizSummary[];
}

const normalizeCategory = (value?: string | null) => value?.trim() ?? "";

const folderName = (category?: string | null) => normalizeCategory(category) || "Uncategorized";

export const getExamCategoryLabel = (category: ExamCategory, categories: ExamCategory[]) => {
    const byId = new Map(categories.map(item => [item.id, item]));
    const names: string[] = [];
    const seen = new Set<string>();
    let current: ExamCategory | undefined = category;
    while (current && !seen.has(current.id)) {
        seen.add(current.id);
        names.unshift(folderName(current.name));
        current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return names.join(" / ");
};

export const groupExamQuizzes = (quizzes: ExamQuizSummary[], categories: ExamCategory[] = []): ExamQuizFolder[] => {
    const folders = new Map<string, ExamQuizFolder>();
    const folderIdByName = new Map<string, string>();
    for (const category of categories) {
        const rawName = folderName(category.name);
        const name = getExamCategoryLabel(category, categories);
        folders.set(category.id, {id: category.id, name, parentId: category.parentId, quizzes: []});
        if (!folderIdByName.has(rawName)) folderIdByName.set(rawName, category.id);
    }
    for (const quiz of quizzes) {
        const name = folderName(quiz.category);
        const id = quiz.categoryId?.trim() || folderIdByName.get(name) || `name:${name}`;
        const folder = folders.get(id) ?? {id, name, parentId: null, quizzes: []};
        folder.quizzes.push(quiz);
        folders.set(id, folder);
    }
    return [...folders.values()]
        .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
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
        const matchesCategory = normalizedCategory === "all"
            || quiz.categoryId === normalizedCategory
            || (!quiz.categoryId && normalizeCategory(quiz.category) === normalizedCategory);
        const matchesVisibility = visibility === "all" || (visibility === "private" ? quiz.isPrivate : !quiz.isPrivate);
        return (!normalizedQuery || searchable.includes(normalizedQuery)) && matchesCategory && matchesVisibility;
    });
};

export const getExamCategories = (quizzes: ExamQuizSummary[]) =>
    [...new Set(quizzes.map(quiz => normalizeCategory(quiz.category)).filter(Boolean))].sort((a, b) => a.localeCompare(b));

export const getExamCategoryOptions = (quizzes: ExamQuizSummary[], categories: ExamCategory[]) => {
    const options = new Map<string, {id: string; name: string}>();
    const categoryNames = new Set<string>();
    for (const category of categories) {
        const name = getExamCategoryLabel(category, categories);
        options.set(category.id, {id: category.id, name});
        categoryNames.add(folderName(category.name));
    }
    for (const quiz of quizzes) {
        const name = folderName(quiz.category);
        if (quiz.categoryId) options.set(quiz.categoryId, {id: quiz.categoryId, name});
        else if (!categoryNames.has(name)) options.set(`name:${name}`, {id: name, name});
    }
    return [...options.values()].sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
};

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
