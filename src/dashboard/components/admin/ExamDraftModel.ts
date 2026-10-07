import type {ExamImportError, ExamQuestion, ManagedExamQuiz} from "../../types/Exam.ts";

export const validateExamDraft = (draft: ManagedExamQuiz, categoryId: string): ExamImportError[] => {
    const errors: ExamImportError[] = [];
    if (!draft.title.trim()) errors.push({path: "title", message: "Enter a quiz title."});
    if (!categoryId) errors.push({path: "category", message: "Choose a folder."});
    if (!Number.isInteger(draft.timeLimitSeconds) || draft.timeLimitSeconds < 0 || draft.timeLimitSeconds > 86400) errors.push({path: "timeLimitSeconds", message: "Enter a time limit between 0 and 86,400 seconds."});
    if (draft.questions.length < 1 || draft.questions.length > 250) errors.push({path: "questions", message: "A quiz needs 1 to 250 questions."});
    draft.questions.forEach((question, index) => {
        if (!question.prompt.trim()) errors.push({path: `questions[${index}].prompt`, message: `Enter a prompt for question ${index + 1}.`});
        if (question.options.length < 2) errors.push({path: `questions[${index}].options`, message: `Question ${index + 1} needs at least two options.`});
        question.options.forEach((option, optionIndex) => { if (!option.text.trim()) errors.push({path: `questions[${index}].options[${optionIndex}]`, message: `Enter option ${optionIndex + 1} for question ${index + 1}.`}); });
        if (question.options.filter(option => option.isCorrect).length !== 1) errors.push({path: `questions[${index}].options`, message: `Choose one correct answer for question ${index + 1}.`});
    });
    return errors;
};

export const moveExamQuestion = (questions: ExamQuestion[], index: number, direction: -1 | 1): ExamQuestion[] => {
    const target = index + direction;
    if (target < 0 || target >= questions.length) return questions;
    const reordered = [...questions];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    return reordered;
};

export const firstInvalidQuestion = (issues: ExamImportError[]): number | null => {
    for (const issue of issues) {
        const match = issue.path.match(/questions(?:\[|\.)(\d+)/);
        if (match) return Number(match[1]);
    }
    return null;
};
