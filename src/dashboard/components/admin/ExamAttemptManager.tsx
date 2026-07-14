import {useEffect, useRef, useState} from "react";
import {useNavigate} from "@/src/dashboard/next-navigation";
import type {ExamAttemptPage} from "../../types/Exam.ts";
import type {AtcmhUser} from "../../types/AtcmhUser.ts";
import {useUserLookup} from "../../hooks/useAdminShared.ts";
import {ExamsApiUtils} from "../../utils/ExamsApiUtils.ts";
import {formatAttemptResult, formatAttemptStatus, formatAttemptSubmittedAt} from "../../utils/ExamAttemptUtils.ts";
import styles from "./ExamAttemptManager.module.css";

interface ExamAttemptManagerProps {
    token: string;
    users: AtcmhUser[];
}

const PAGE_SIZE = 25;

const ExamAttemptManager = ({token, users}: ExamAttemptManagerProps) => {
    const navigate = useNavigate();
    const {getUserNameOrFallback} = useUserLookup(users);
    const [query, setQuery] = useState("");
    const [page, setPage] = useState(1);
    const [data, setData] = useState<ExamAttemptPage | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);
    const requestVersion = useRef(0);

    useEffect(() => {
        let active = true;
        const version = ++requestVersion.current;
        setIsLoading(true);
        setError(null);
        void ExamsApiUtils.listAttempts(page, PAGE_SIZE, query, token).then(result => {
            if (active && version === requestVersion.current) setData(result);
        }).catch(reason => {
            if (active && version === requestVersion.current) setError(reason instanceof Error ? reason.message : String(reason));
        }).finally(() => {
            if (active && version === requestVersion.current) setIsLoading(false);
        });
        return () => { active = false; };
    }, [page, query, reloadKey, token]);

    const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
    const changeQuery = (value: string) => {
        setQuery(value);
        setPage(1);
    };

    return <section className={styles.manager} aria-labelledby="attempts-heading">
        <div className={styles.heading}>
            <div><p className={styles.eyebrow}>Historical records</p><h2 id="attempts-heading">Attempts</h2></div>
            <label className={styles.searchField}><span className={styles.visuallyHidden}>Search attempts</span><input type="search" value={query} onChange={event => changeQuery(event.target.value)} placeholder="Search learner, quiz, Discord ID, or code" aria-label="Search attempts"/></label>
        </div>
        {error ? <div className={styles.error} role="alert"><p>{error}</p><button type="button" onClick={() => setReloadKey(key => key + 1)}>Try again</button></div> : null}
        {isLoading ? <p className={styles.loading} aria-live="polite">Loading attempts…</p> : null}
        {!isLoading && !error && data?.attempts.length === 0 ? <p className={styles.empty}>{query ? "No attempts match that search." : "No past attempts are available yet."}</p> : null}
        {!isLoading && !error && data && data.attempts.length > 0 ? <>
            <p className={styles.resultCount}>{data.total} {data.total === 1 ? "attempt" : "attempts"}</p>
            <div className={styles.list} aria-label="Past attempts">
                {data.attempts.map(attempt => {
                    const displayName = getUserNameOrFallback(attempt.studentDiscordId, attempt.studentName);
                    return <article className={styles.row} key={attempt.id}>
                    <div className={styles.learner}><strong>{displayName}</strong><span>{attempt.studentDiscordId ?? "Legacy attempt"}</span></div>
                    <div className={styles.quiz}><strong>{attempt.quizTitle}</strong><span>Code {attempt.code}</span></div>
                    <div className={styles.result}><strong>{formatAttemptResult(attempt)}</strong><span className={attempt.status === "timed_out" ? styles.timeout : styles.submitted}>{formatAttemptStatus(attempt.status)}</span></div>
                    <time className={styles.submittedAt} dateTime={attempt.submittedAt ?? undefined}>{formatAttemptSubmittedAt(attempt.submittedAt)}</time>
                    <button type="button" className={styles.reviewButton} onClick={() => navigate(`/dashboard/exams/attempts/${attempt.id}`)}>Review</button>
                </article>;
                })}
            </div>
            {totalPages > 1 ? <nav className={styles.pagination} aria-label="Attempts pages">
                <button type="button" disabled={page <= 1} onClick={() => setPage(current => current - 1)}>Previous</button>
                <span>Page {data.page} of {totalPages}</span>
                <button type="button" disabled={page >= totalPages} onClick={() => setPage(current => current + 1)}>Next</button>
            </nav> : null}
        </> : null}
    </section>;
};

export default ExamAttemptManager;
