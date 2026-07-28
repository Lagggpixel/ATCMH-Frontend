import type {ApplicationQuestion, ApplicationType} from "@/src/dashboard/types/ApplicationQuestion";
import {defaultWeeklyAvailabilityAnswer, isCanonicalWeeklyAvailability} from "./weekly-availability";

export const applicationTypes: Array<{value: ApplicationType; label: string; description: string}> = [
    {value: "mentor", label: "Full mentorship", description: "Structured written and practical preparation with a dedicated mentor."},
    {value: "written", label: "Written exam help", description: "Focused guidance on IFATC written-exam knowledge and questions."},
    {value: "mock", label: "Mock practical", description: "A simulated practical for returning or test-ready applicants."},
];

export function parseApplicationType(value: string | null): ApplicationType | null {
    return applicationTypes.some(option => option.value === value) ? value as ApplicationType : null;
}

const normalizedAnswer = (value: string | undefined) => value?.trim().toLowerCase() ?? "";

function dependencyMatches(answer: string | undefined, expected: string | null) {
    const actual = normalizedAnswer(answer);
    const target = normalizedAnswer(expected ?? "");
    if (target === "true" || target === "yes") return actual === "yes" || actual === "true";
    if (target === "false" || target === "no") return actual === "no" || actual === "false";
    return actual === target;
}

export function visibleApplicationQuestions(
    questions: ApplicationQuestion[],
    answers: Record<string, string>,
): ApplicationQuestion[] {
    const ordered = [...questions].sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key));
    const visibleKeys = new Set<string>();
    return ordered.filter(question => {
        if (!question.active) return false;
        if (!question.dependsOnKey) {
            visibleKeys.add(question.key);
            return true;
        }
        const visible = visibleKeys.has(question.dependsOnKey)
            && dependencyMatches(answers[question.dependsOnKey], question.dependsOnValue);
        if (visible) visibleKeys.add(question.key);
        return visible;
    });
}

export function pruneApplicationAnswers(
    questions: ApplicationQuestion[],
    answers: Record<string, string>,
): Record<string, string> {
    return Object.fromEntries(visibleApplicationQuestions(questions, answers)
        .filter(question => answers[question.key] != null)
        .map(question => [question.key, answers[question.key].trim()]));
}

export function initializeApplicationAnswers(
    questions: ApplicationQuestion[],
    answers: Record<string, string>,
): Record<string, string> {
    const initialized = {...answers};
    for (const question of questions) {
        if (question.active && question.inputType === "WEEKLY_AVAILABILITY" && !initialized[question.key]?.trim()) {
            initialized[question.key] = defaultWeeklyAvailabilityAnswer();
        }
    }
    return initialized;
}

export function validateApplicationAnswers(
    questions: ApplicationQuestion[],
    answers: Record<string, string>,
): Record<string, string> {
    const errors: Record<string, string> = {};
    for (const question of visibleApplicationQuestions(questions, answers)) {
        const value = answers[question.key]?.trim() ?? "";
        if (!value) errors[question.key] = "Please answer this question.";
        else if (question.inputType === "POSITIVE_INTEGER" && (!/^\d+$/.test(value) || Number(value) < 1)) {
            errors[question.key] = "Enter a whole number greater than zero.";
        } else if (question.inputType === "YES_NO" && !["yes", "no"].includes(value.toLowerCase())) {
            errors[question.key] = "Choose yes or no.";
        } else if (question.inputType === "WEEKLY_AVAILABILITY" && !isCanonicalWeeklyAvailability(value)) {
            errors[question.key] = "Choose valid start and end times for each available day.";
        }
    }
    return errors;
}
