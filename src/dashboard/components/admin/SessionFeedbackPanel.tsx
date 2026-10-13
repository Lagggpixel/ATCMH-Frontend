"use client";

import {useEffect, useState} from "react";
import {ApiUtils} from "../../utils/ApiUtils";
import type {SavedSessionFeedback} from "../../types/SessionFeedback";
import styles from "./SessionFeedbackPanel.module.css";
import type {Session} from "../../types/Session";

const contextText = {
    HELD: "Training occurred. Ratings reflect the available documented performance.",
    INTERRUPTED: "Training stopped early. Tasks prevented by the interruption are not assessed.",
    NOT_HELD: "The thread reports that training did not run. No performance grade is assigned.",
    UNKNOWN: "The session outcome is unclear. Missing evidence is not treated as failure.",
};

export default function SessionFeedbackPanel({sessionId, canGenerate = false, canMarkNotHeld = false, token = null, outcome, onOutcomeChanged}: {
    sessionId: number; canGenerate?: boolean; canMarkNotHeld?: boolean; token?: string | null; outcome?: string; onOutcomeChanged?: (session: Session) => void;
}) {
    const [saved, setSaved] = useState<SavedSessionFeedback>();
    const [loadFailed, setLoadFailed] = useState(false);
    const [error, setError] = useState<string>();
    const [busy, setBusy] = useState(false);
    const [retained, setRetained] = useState(false);
    const [confirmNotHeld, setConfirmNotHeld] = useState(false);
    useEffect(() => {
        const controller = new AbortController();
        setSaved(undefined); setLoadFailed(false); setError(undefined); setRetained(false); setConfirmNotHeld(false);
        ApiUtils.getSessionFeedback(sessionId, controller.signal).then(result => {
            if (!controller.signal.aborted) {
                if (!result) setLoadFailed(true); else setSaved(result);
            }
        }).catch(() => {if (!controller.signal.aborted) setLoadFailed(true);});
        return () => controller.abort();
    }, [sessionId]);
    const generate = async (force: boolean) => {
        setBusy(true); setError(undefined);
        try {
            const result = await ApiUtils.generateSessionFeedback(sessionId, token, force);
            if (!result) throw new Error();
            setSaved(result);
        } catch {setError("Feedback could not be generated. Any previous saved result is preserved.");}
        finally {setBusy(false);}
    };
    const notHeld = async () => {
        setBusy(true); setError(undefined);
        try {
            const result = await ApiUtils.markSessionNotHeld(sessionId, token);
            if (!result) throw new Error();
            setRetained(true); setConfirmNotHeld(false);
            onOutcomeChanged?.(result);
        } catch {setError("Session status could not be saved.");}
        finally {setBusy(false);}
    };
    const review = saved?.status === "READY" ? saved.data : undefined;
    const assessment = retained || outcome === "NOT_HELD" ? undefined : review?.summary.assessment;
    return <section className={styles.panel} aria-labelledby={`session-feedback-${sessionId}`}>
        <div className={styles.heading}>
            <h3 id={`session-feedback-${sessionId}`}>Summarized feedback</h3>
            {!review ? <span className={styles.availability} role="status">{!saved && !loadFailed ? "Loading…" : "Unavailable"}</span> : null}
        </div>
        {retained ? <p role="status">Marked not held. Recorded attendance is retained.</p> : null}
        {error ? <p role="alert">{error}</p> : null}
        {assessment ? <p className={styles.context}><strong>Session context</strong><br/>{contextText[assessment.context]}</p> : null}
        {review ? <>
            <p>{review.summary.overview.text}</p>
            {assessment ? <table className={styles.ratings}><caption>Controller performance</caption><thead><tr><th scope="col">Category</th><th scope="col">Assessment</th></tr></thead>
                <tbody>{assessment.categories.map(category => <tr key={category.category}>
                    <th scope="row">{category.category}</th><td>{category.rating}</td>
                </tr>)}</tbody></table> : null}
            {([['Feedback', review.summary.keyFeedback], ['Progress', review.summary.progress], ['Follow-up', review.summary.followUp]] as const).map(([title, findings]) =>
                findings?.length ? <div key={title}><h4>{title}</h4><ul>{findings.map((finding, index) => <li key={index}>{finding.text}</li>)}</ul></div> : null)}
            {review.summary.uncertainties.length ? <ul>{review.summary.uncertainties.map((text, index) => <li key={index}>{text}</li>)}</ul> : null}
            {/^https:\/\/discord\.com\/channels\/\d+\/\d+$/.test(review.threadUrl) ? <a href={review.threadUrl} target="_blank" rel="noreferrer">Open assignment thread</a> : null}
        </> : null}
        {canGenerate || (canMarkNotHeld && !retained) ? <div className={styles.actions}>
            {canGenerate ? <button type="button" disabled={busy || !saved} onClick={() => void generate(saved?.status !== "NOT_GENERATED")}>{busy ? "Working…" : saved?.status === "NOT_GENERATED" ? "Generate feedback" : "Force refresh"}</button> : null}
            {canMarkNotHeld && !retained ? <button type="button" disabled={busy} onClick={() => setConfirmNotHeld(true)}>Mark not held · retain attendance</button> : null}
        </div> : null}
        {confirmNotHeld ? <div role="group" aria-label="Confirm session outcome"><p>Cancel this session while keeping recorded attendance credit? This does not count as completed training.</p>
            <button type="button" disabled={busy} onClick={() => void notHeld()}>Confirm not held</button>{" "}
            <button type="button" disabled={busy} onClick={() => setConfirmNotHeld(false)}>Keep current status</button></div> : null}
    </section>;
}
