"use client";

import {useMemo, useState} from "react";
import type {CourseActivity, CourseActivityProgress} from "@/src/dashboard/types/Course";
import {ExamsApiUtils} from "@/src/dashboard/utils/ExamsApiUtils";
import styles from "./CourseReader.module.css";

interface CourseActivityCardProps {
    courseId: string;
    activity: CourseActivity;
    progress?: CourseActivityProgress;
    mode?: "learner" | "admin";
}

interface ActivityStep {id: string; label: string}

function stepsFor(activity: CourseActivity): ActivityStep[] {
    const value = activity.definition.steps;
    return Array.isArray(value) ? value.flatMap(step => {
        if (typeof step !== "object" || step === null) return [];
        const item = step as Record<string, unknown>;
        return typeof item.id === "string" && typeof item.label === "string" ? [{id: item.id, label: item.label}] : [];
    }) : [];
}

function optionsFor(activity: CourseActivity) {
    const value = activity.definition.options;
    return Array.isArray(value) ? value.filter((option): option is string => typeof option === "string") : [];
}

export default function CourseActivityCard({courseId, activity, progress, mode = "learner"}: CourseActivityCardProps) {
    const interactive = mode === "learner";
    const steps = useMemo(() => stepsFor(activity), [activity]);
    const options = useMemo(() => optionsFor(activity), [activity]);
    const [orderedIds, setOrderedIds] = useState<string[]>(() => steps.map(() => ""));
    const [text, setText] = useState("");
    const [selectedConflicts, setSelectedConflicts] = useState<string[]>([]);
    const [pending, setPending] = useState(false);
    const [result, setResult] = useState<{score: number; passed: boolean; feedback?: string} | null>(null);
    const [error, setError] = useState<string | null>(null);

    const submit = async () => {
        setPending(true);
        setError(null);
        try {
            const session = await ExamsApiUtils.getExistingSession();
            if (!session?.csrfToken) throw new Error("Your ATCMH session has expired. Please sign in again.");
            const answer = activity.type === "sequence"
                ? {orderedIds}
                : activity.type === "conflict"
                    ? {conflicts: selectedConflicts}
                    : {response: text.trim()};
            const response = await ExamsApiUtils.submitCourseActivity(courseId, activity.id, answer, session.csrfToken,
                typeof globalThis.crypto?.randomUUID === "function" ? globalThis.crypto.randomUUID() : undefined);
            setResult({score: response.score, passed: response.passed, feedback: response.feedback});
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            setPending(false);
        }
    };

    return <aside className={styles.activityCard} aria-label={`${activity.required ? "Required " : ""}${activity.type} activity`}>
        <div className={styles.activityHeader}><div><p className={styles.activityEyebrow}>{activity.required ? "Required activity" : "Practice activity"} · {activity.type}</p><h3>{activity.title}</h3></div>{progress?.passed ? <span className={styles.activityPassed}>Passed</span> : null}</div>
        <p className={styles.activityPrompt}>{activity.prompt}</p>
        {interactive && activity.type === "sequence" && steps.length > 0 ? <div className={styles.activityInputs}>{steps.map((step, index) => <label key={step.id}>Step {index + 1}<select value={orderedIds[index] ?? ""} onChange={event => setOrderedIds(current => current.map((value, stepIndex) => stepIndex === index ? event.target.value : value))}><option value="">Choose a step…</option>{steps.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>)}</div> : null}
        {interactive && activity.type === "conflict" && options.length > 0 ? <fieldset className={styles.activityOptions}><legend>Select the conflicts you would resolve</legend>{options.map(option => <label key={option}><input type="checkbox" checked={selectedConflicts.includes(option)} onChange={event => setSelectedConflicts(current => event.target.checked ? [...current, option] : current.filter(value => value !== option))}/>{option}</label>)}</fieldset> : null}
        {interactive && activity.type !== "sequence" && activity.type !== "conflict" ? <label className={styles.activityResponse}>Your response<textarea rows={4} value={text} onChange={event => setText(event.target.value)} placeholder={activity.type === "clearance" ? "Write the clearance you would issue…" : "Explain your decision…"}/></label> : null}
        {!interactive ? <p className={styles.activityPreview}>Admin preview · learner response fields and scoring are hidden.</p> : null}
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        {result ? <p className={result.passed ? styles.activityResultPassed : styles.activityResultFailed} role="status">{result.passed ? `Passed · ${result.score}%` : `Try again · ${result.score}%`}{result.feedback ? ` — ${result.feedback}` : ""}</p> : null}
        <div className={styles.activityFooter}><span>Pass {activity.passPercentage}% · attempts {progress?.attemptCount ?? 0}</span>{interactive ? <button type="button" className={styles.activityAction} disabled={pending} onClick={() => void submit()}>{pending ? "Checking…" : result && !result.passed ? "Try again" : "Submit activity"}</button> : null}</div>
    </aside>;
}
