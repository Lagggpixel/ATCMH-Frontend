import type {ExamAttemptStatus, ExamAttemptSummary} from "../types/Exam.ts";

export const filterExamAttempts = (attempts: ExamAttemptSummary[], query: string) => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return attempts;
    return attempts.filter(attempt => [
        attempt.studentName,
        attempt.studentDiscordId ?? "",
        attempt.quizTitle,
        attempt.code,
    ].some(value => value.toLocaleLowerCase().includes(normalizedQuery)));
};

export const formatAttemptResult = (attempt: Pick<ExamAttemptSummary, "score" | "total" | "percentage">) =>
    `${attempt.score} / ${attempt.total} · ${attempt.percentage}%`;

export const formatAttemptStatus = (status: ExamAttemptStatus) => status === "timed_out" ? "Timed out" : "Submitted";

export const formatAttemptSubmittedAt = (submittedAt: string | null) => {
    if (!submittedAt) return "No submitted time";
    const date = new Date(submittedAt);
    if (Number.isNaN(date.getTime())) return submittedAt;
    return new Intl.DateTimeFormat(undefined, {dateStyle: "medium", timeStyle: "short"}).format(date);
};
