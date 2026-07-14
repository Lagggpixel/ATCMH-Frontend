import {useEffect, useMemo, useRef, useState} from "react";
import type {AtcmhUser} from "../../types/AtcmhUser.ts";
import type {ExamQuizSummary, ExamQuizUnlock, ExamQuizUnlockUpdate} from "../../types/Exam.ts";
import {ExamsApiUtils} from "../../utils/ExamsApiUtils.ts";
import {groupExamQuizzes} from "../../utils/ExamCatalogUtils.ts";
import {filterUnlockCandidates, isAlreadyUnlocked, isCurrentUnlockListRequest, isDiscordId} from "../../utils/ExamUnlockUtils.ts";
import styles from "./ExamUnlockManager.module.css";

interface ExamUnlockManagerProps {
    quizzes: ExamQuizSummary[];
    users: AtcmhUser[];
    token: string;
}

const ExamUnlockManager = ({quizzes, users, token}: ExamUnlockManagerProps) => {
    const privateQuizFolders = useMemo(
        () => groupExamQuizzes([...quizzes.filter(quiz => quiz.isPrivate)].sort((a, b) => a.title.localeCompare(b.title))),
        [quizzes]
    );
    const [selectedQuizId, setSelectedQuizId] = useState("");
    const selectedQuizIdRef = useRef("");
    const listRequestVersionRef = useRef(0);
    const [unlocks, setUnlocks] = useState<ExamQuizUnlock[]>([]);
    const [query, setQuery] = useState("");
    const [selectedUser, setSelectedUser] = useState<AtcmhUser | null>(null);
    const [manualDiscordId, setManualDiscordId] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [pendingDiscordId, setPendingDiscordId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const candidates = useMemo(() => filterUnlockCandidates(users, unlocks, query), [query, unlocks, users]);

    useEffect(() => {
        setUnlocks([]);
        setError(null);
        if (!selectedQuizId) {
            setIsLoading(false);
            return;
        }
        let active = true;
        const requestVersion = ++listRequestVersionRef.current;
        setIsLoading(true);
        void ExamsApiUtils.listQuizUnlocks(selectedQuizId, token).then(next => {
            if (active && isCurrentUnlockListRequest(requestVersion, listRequestVersionRef.current, selectedQuizId, selectedQuizIdRef.current)) setUnlocks(next);
        }).catch(reason => {
            if (active && isCurrentUnlockListRequest(requestVersion, listRequestVersionRef.current, selectedQuizId, selectedQuizIdRef.current)) setError(reason instanceof Error ? reason.message : String(reason));
        }).finally(() => {
            if (active && isCurrentUnlockListRequest(requestVersion, listRequestVersionRef.current, selectedQuizId, selectedQuizIdRef.current)) setIsLoading(false);
        });
        return () => { active = false; };
    }, [selectedQuizId, token]);

    const updateUnlock = async (update: ExamQuizUnlockUpdate) => {
        const quizId = selectedQuizIdRef.current;
        if (!quizId || isLoading || pendingDiscordId || (update.unlocked && isAlreadyUnlocked(unlocks, update.discordId))) return;
        setError(null);
        setPendingDiscordId(update.discordId);
        let refreshRequestVersion: number | null = null;
        try {
            await ExamsApiUtils.updateQuizUnlock(quizId, update, token);
            if (selectedQuizIdRef.current !== quizId) return;
            const requestVersion = ++listRequestVersionRef.current;
            refreshRequestVersion = requestVersion;
            const refreshedUnlocks = await ExamsApiUtils.listQuizUnlocks(quizId, token);
            if (!isCurrentUnlockListRequest(requestVersion, listRequestVersionRef.current, quizId, selectedQuizIdRef.current)) return;
            setUnlocks(refreshedUnlocks);
            setIsLoading(false);
            if (update.unlocked) {
                setSelectedUser(null);
                setQuery("");
                setManualDiscordId("");
            }
        } catch (reason) {
            const refreshIsCurrent = refreshRequestVersion === null || isCurrentUnlockListRequest(
                refreshRequestVersion,
                listRequestVersionRef.current,
                quizId,
                selectedQuizIdRef.current
            );
            if (selectedQuizIdRef.current === quizId && refreshIsCurrent) {
                setError(reason instanceof Error ? reason.message : String(reason));
                setIsLoading(false);
            }
        } finally {
            setPendingDiscordId(null);
        }
    };

    if (privateQuizFolders.length === 0) return <section className={styles.manager} aria-labelledby="unlock-heading">
        <h2 id="unlock-heading">Learner unlocks</h2>
        <p>No private quizzes are available. Public quizzes do not require learner unlocks.</p>
    </section>;

    const targetDiscordId = selectedUser?.id ?? manualDiscordId.trim();
    const targetAlreadyUnlocked = isAlreadyUnlocked(unlocks, targetDiscordId);
    const canUnlock = (Boolean(selectedUser) || isDiscordId(manualDiscordId)) && !targetAlreadyUnlocked;
    const selectQuiz = (quizId: string) => {
        listRequestVersionRef.current += 1;
        selectedQuizIdRef.current = quizId;
        setSelectedQuizId(quizId);
        setSelectedUser(null);
        setQuery("");
        setManualDiscordId("");
    };

    return <section className={styles.manager} aria-labelledby="unlock-heading">
        <div className={styles.heading}><p className={styles.eyebrow}>Private quiz access</p><h2 id="unlock-heading">Learner unlocks</h2><p>Grant or remove access for one learner at a time.</p></div>
        <label className={styles.quizPicker}>Private quiz<select value={selectedQuizId} onChange={event => selectQuiz(event.target.value)}>
            <option value="">Choose a private quiz</option>
            {privateQuizFolders.map(folder => <optgroup key={folder.name} label={folder.name}>
                {folder.quizzes.map(quiz => <option key={quiz.id} value={quiz.id}>{quiz.title}</option>)}
            </optgroup>)}
        </select></label>
        {!selectedQuizId ? <p className={styles.prompt}>Choose a private quiz to view and manage its learner unlocks.</p> : <div className={styles.workspace}>
            <section className={styles.memberSection} aria-labelledby="add-learner-heading">
                <h3 id="add-learner-heading">Unlock a learner</h3>
                <label>Search Dashboard members<input value={query} onChange={event => { setQuery(event.target.value); setSelectedUser(null); }} placeholder="Username or Discord ID"/></label>
                {candidates.length > 0 && !selectedUser ? <div className={styles.results} aria-label="Matching members">{candidates.map(user => <button type="button" key={user.id} onClick={() => { setSelectedUser(user); setQuery(user.username); setManualDiscordId(""); }}><strong>{user.username}</strong><span>{user.id}</span></button>)}</div> : null}
                {selectedUser ? <p className={styles.selection}>Selected: <strong>{selectedUser.username}</strong> <span>{selectedUser.id}</span></p> : <>
                    <div className={styles.divider}><span>or use a Discord ID</span></div>
                    <label>Manual Discord ID<input inputMode="numeric" value={manualDiscordId} onChange={event => setManualDiscordId(event.target.value)} aria-describedby="discord-id-help"/></label>
                    <p className={styles.help} id="discord-id-help">Enter the learner’s 15–20 digit Discord ID. A username will not be inferred.</p>
                    {targetAlreadyUnlocked ? <p className={styles.help} role="status">This learner is already unlocked for this quiz.</p> : null}
                </>}
                <button className={styles.unlockButton} type="button" disabled={!canUnlock || isLoading || Boolean(pendingDiscordId)} onClick={() => void updateUnlock({discordId: targetDiscordId, ...(selectedUser ? {userName: selectedUser.username} : {}), unlocked: true})}>{pendingDiscordId === targetDiscordId ? "Unlocking…" : "Unlock learner"}</button>
            </section>
            <section className={styles.listSection} aria-labelledby="current-unlocks-heading">
                <h3 id="current-unlocks-heading">Current unlocks</h3>
                {isLoading ? <p aria-live="polite">Loading quiz unlocks…</p> : null}
                {!isLoading && !error && unlocks.length === 0 ? <p>No learners are currently unlocked for this quiz.</p> : null}
                {!isLoading && unlocks.length > 0 ? <ul>{unlocks.map(unlock => <li key={unlock.discordId}><div><strong>{unlock.userName ?? "Discord user"}</strong><span>{unlock.discordId}</span></div><button type="button" className={styles.lockButton} disabled={Boolean(pendingDiscordId)} onClick={() => void updateUnlock({discordId: unlock.discordId, ...(unlock.userName ? {userName: unlock.userName} : {}), unlocked: false})}>{pendingDiscordId === unlock.discordId ? "Locking…" : "Lock"}</button></li>)}</ul> : null}
            </section>
        </div>}
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
    </section>;
};

export default ExamUnlockManager;
