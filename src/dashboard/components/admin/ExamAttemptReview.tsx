import {useEffect, useRef, useState} from "react";
import {Link, useNavigate, useParams} from "@/src/dashboard/next-navigation";
import type {ExamAttemptDetail, ExamManagementActor} from "../../types/Exam.ts";
import type {AtcmhUser} from "../../types/AtcmhUser.ts";
import {useUserLookup} from "../../hooks/useAdminShared.ts";
import {ExamsApiUtils} from "../../utils/ExamsApiUtils.ts";
import {formatAttemptResult, formatAttemptStatus, formatAttemptSubmittedAt} from "../../utils/ExamAttemptUtils.ts";
import styles from "./ExamAttemptReview.module.css";

interface ExamAttemptReviewProps { token: string; actor: ExamManagementActor; users: AtcmhUser[]; }

const ExamAttemptReview = ({token, actor, users}: ExamAttemptReviewProps) => {
    const navigate = useNavigate();
    const {getUserNameOrFallback} = useUserLookup(users);
    const {attemptId} = useParams<{attemptId: string}>();
    const [attempt, setAttempt] = useState<ExamAttemptDetail | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const requestVersion = useRef(0);

    useEffect(() => {
        if (!attemptId) return;
        let active = true;
        const version = ++requestVersion.current;
        setAttempt(null);
        setError(null);
        setIsLoading(true);
        void ExamsApiUtils.getAttempt(attemptId, token).then(result => {
            if (active && version === requestVersion.current) setAttempt(result);
        }).catch(reason => {
            if (active && version === requestVersion.current) setError(reason instanceof Error ? reason.message : String(reason));
        }).finally(() => {
            if (active && version === requestVersion.current) setIsLoading(false);
        });
        return () => { active = false; };
    }, [attemptId, token]);

    const deleteAttempt = async () => {
        if (!attempt || !attemptId || isDeleting) return;
        setIsDeleting(true);
        setError(null);
        try {
            await ExamsApiUtils.deleteAttempt(attemptId, token);
            navigate("/dashboard/exams/attempts");
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
            setIsDeleting(false);
        }
    };

    if (isLoading) return <section className={styles.state} aria-live="polite"><p>Loading attempt review…</p></section>;
    if (!attempt) return <section className={styles.state} role="alert"><p>{error ?? "This attempt could not be found."}</p><Link to="/dashboard/exams/attempts">Back to attempts</Link></section>;
    const review = attempt.review;
    const displayName = getUserNameOrFallback(attempt.studentDiscordId, attempt.studentName);

    return <section className={styles.review} aria-labelledby="attempt-review-heading">
        <Link className={styles.backLink} to="/dashboard/exams/attempts">← Back to attempts</Link>
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        <header className={styles.heading}>
            <div><p className={styles.eyebrow}>Stored attempt</p><h2 id="attempt-review-heading">{displayName}</h2><p>{attempt.quizTitle}</p></div>
            <div className={styles.actions}>{actor.canManageAll ? <button type="button" className={styles.deleteButton} onClick={() => setIsConfirmingDelete(true)}>Delete attempt</button> : null}</div>
        </header>
        <dl className={styles.summary}>
            <div><dt>Result</dt><dd>{formatAttemptResult(attempt)}</dd></div>
            <div><dt>Status</dt><dd>{formatAttemptStatus(attempt.status)}</dd></div>
            <div><dt>Submitted</dt><dd>{formatAttemptSubmittedAt(attempt.submittedAt)}</dd></div>
            <div><dt>Attempt code</dt><dd>{attempt.code}</dd></div>
            <div><dt>Discord ID</dt><dd>{attempt.studentDiscordId ?? "Not recorded"}</dd></div>
        </dl>
        {isConfirmingDelete ? <section className={styles.confirmation} role="dialog" aria-modal="true" aria-labelledby="delete-attempt-heading">
            <h3 id="delete-attempt-heading">Delete this attempt?</h3><p>This permanently removes {displayName}’s attempt for {attempt.quizTitle}, including its answers.</p>
            <div><button type="button" onClick={() => setIsConfirmingDelete(false)} disabled={isDeleting}>Keep attempt</button><button type="button" className={styles.confirmDelete} onClick={() => void deleteAttempt()} disabled={isDeleting}>{isDeleting ? "Deleting…" : "Delete attempt"}</button></div>
        </section> : null}
        <section className={styles.questions} aria-labelledby="questions-heading">
            <h3 id="questions-heading">Question review</h3>
            {!review.available ? <p className={styles.unavailable}>A per-question review was not recorded for this historical attempt.</p> : <ol>{review.questions.map((question, index) => <li key={`${index}-${question.prompt}`} className={styles.question}>
                <p className={styles.prompt}><span>{index + 1}</span>{question.prompt}</p>
                <dl><div><dt>Selected</dt><dd>{question.selectedText ?? "No answer"}</dd></div>{review.revealCorrectness ? <div><dt>Correct answer</dt><dd>{question.correctText ?? "Not recorded"}</dd></div> : null}<div><dt>Result</dt><dd className={styles[question.state]}>{question.state === "unanswered" ? "Unanswered" : question.state === "selected" ? "Selected" : question.state === "correct" ? "Correct" : "Incorrect"}</dd></div></dl>
            </li>)}</ol>}
        </section>
    </section>;
};

export default ExamAttemptReview;
