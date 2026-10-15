"use client";
import {useEffect, useId, useState} from "react";
import {CaretDownIcon} from "@phosphor-icons/react/CaretDown";
import {CircleIcon} from "@phosphor-icons/react/Circle";
import {ArrowUpRightIcon} from "@phosphor-icons/react/ArrowUpRight";
import {FileTextIcon} from "@phosphor-icons/react/FileText";
import {ChatTextIcon} from "@phosphor-icons/react/ChatText";
import {ApiUtils} from "../../utils/ApiUtils";
import type {RecentFeedback, SavedSessionFeedback, SessionRating} from "../../types/SessionFeedback";
import styles from "./RecentTrainingFeedback.module.css";

const sessionDate = new Intl.DateTimeFormat("en-GB", {day: "2-digit", month: "short", year: "numeric", timeZone: "UTC"});
const sessionTime = new Intl.DateTimeFormat("en-GB", {hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC"});

const ratingTone: Record<SessionRating, string> = {
    "Correctly handled": "correct",
    "Mostly correctly handled": "mostlyCorrect",
    "Mostly incorrectly handled": "mostlyIncorrect",
    "Incorrect": "incorrect",
    "Not assessed": "unassessed",
};

function feedbackLabel(feedback: SavedSessionFeedback) {
    if (feedback.status === "READY" && feedback.data) return "Saved feedback";
    if (feedback.status === "NOT_GENERATED") return "No saved feedback yet";
    if (feedback.status === "RUNNING") return "Feedback pending";
    return "Feedback unavailable";
}

export function RecentTrainingFeedbackSessions({rows}: {rows: RecentFeedback[]}) {
    const group = useId();
    const firstSaved = rows.findIndex(row => row.feedback.status === "READY" && row.feedback.data);
    return <div className={styles.sessions}>
        <div className={styles.columnHeadings} aria-hidden="true">
            <span>Airport &amp; session</span><span>Date (UTC)</span><span>Feedback</span><span/>
        </div>
        {rows.map((row, index) => {
            const review = row.feedback.status === "READY" ? row.feedback.data : undefined;
            const assessment = review?.summary.assessment;
            const categories = assessment?.context === "NOT_HELD" ? [] : assessment?.categories ?? [];
            const date = new Date(row.time);
            const validDate = !Number.isNaN(date.getTime());
            const threadUrl = review?.threadUrl;
            return <details className={styles.session} key={row.sessionId} name={group} open={index === (firstSaved < 0 ? 0 : firstSaved)}>
                <summary className={styles.sessionHeading}>
                    <span className={styles.identity}><strong>{row.airport || "Unknown airport"}</strong><span>· #{row.sessionId}</span></span>
                    <span className={styles.date}>{validDate ? <time dateTime={date.toISOString()}>{sessionDate.format(date)}<span className={styles.time}>, {sessionTime.format(date)}<span className={styles.mobileUtc}> UTC</span></span></time> : "Date unavailable"}</span>
                    <span className={review ? styles.savedStatus : styles.status}>{feedbackLabel(row.feedback)}</span>
                    <CaretDownIcon className={styles.caret} size={20} aria-hidden="true"/>
                </summary>
                <div className={`${styles.detail} ${categories.length ? "" : styles.summaryOnly}`}>
                    {categories.length ? <table className={styles.ratings}>
                        <caption className={styles.visuallyHidden}>Controller performance for session #{row.sessionId}</caption>
                        <thead><tr><th scope="col">Category</th><th scope="col">Assessment</th></tr></thead>
                        <tbody>{categories.map(category => <tr key={category.category}>
                            <th scope="row">{category.category}</th>
                            <td><span className={styles.rating}><CircleIcon size={10} weight="fill" className={styles[ratingTone[category.rating]]} aria-hidden="true"/>{category.rating}</span></td>
                        </tr>)}</tbody>
                    </table> : null}
                    <div className={styles.summary}>
                        <h4>Session summary</h4>
                        <p>{review?.summary.overview.text || (row.feedback.status === "NOT_GENERATED" ? "No saved feedback yet." : row.feedback.status === "RUNNING" ? "Feedback is pending. A saved summary is not available yet." : "Saved feedback is currently unavailable for this session.")}</p>
                        {assessment?.context === "INTERRUPTED" ? <p className={styles.context}>Training stopped early. Tasks prevented by the interruption are not assessed.</p> : null}
                        {assessment?.context === "NOT_HELD" ? <p className={styles.context}>Training did not run. No performance grade is assigned.</p> : null}
                        <div className={styles.links}>
                            <a href={`/dashboard/sessions?session=${row.sessionId}`}><FileTextIcon size={19} aria-hidden="true"/>View session<ArrowUpRightIcon size={14} aria-hidden="true"/></a>
                            {threadUrl && /^https:\/\/discord\.com\/channels\/\d+\/\d+$/.test(threadUrl) ? <a href={threadUrl} target="_blank" rel="noreferrer"><ChatTextIcon size={19} aria-hidden="true"/>Open assignment thread<ArrowUpRightIcon size={14} aria-hidden="true"/><span className={styles.visuallyHidden}> (opens in a new tab)</span></a> : null}
                        </div>
                    </div>
                </div>
            </details>;
        })}
    </div>;
}

export default function RecentTrainingFeedback({menteeRecordId}: {menteeRecordId: number}) {
    const [rows, setRows] = useState<RecentFeedback[]>();
    const [error, setError] = useState(false);
    useEffect(() => {
        const controller = new AbortController();
        setRows(undefined);
        setError(false);
        ApiUtils.getRecentTrainingFeedback(menteeRecordId, controller.signal).then(result => {
            if (!controller.signal.aborted) {
                if (result) setRows(result);
                else setError(true);
            }
        }).catch(() => {if (!controller.signal.aborted) setError(true);});
        return () => controller.abort();
    }, [menteeRecordId]);
    return <section className={styles.section} aria-labelledby="recent-training-feedback-title">
        <header className={styles.heading}>
            <h3 id="recent-training-feedback-title">Recent training feedback</h3>
            <p>Latest five recorded completed sessions in this mentorship.</p>
        </header>
        {error ? <p className={styles.notice} role="alert">Saved recent feedback could not be loaded.</p> : !rows ? <p className={styles.notice} role="status">Loading saved feedback…</p>
            : rows.length === 0 ? <p className={styles.notice}>No completed training sessions recorded yet.</p>
                : <RecentTrainingFeedbackSessions key={menteeRecordId} rows={rows}/>}
    </section>;
}
