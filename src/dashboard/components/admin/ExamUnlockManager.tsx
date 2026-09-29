import {useEffect, useMemo, useRef, useState} from "react";
import type {AtcmhUser} from "../../types/AtcmhUser.ts";
import type {ExamQuizSummary, ExamQuizUnlock, ExamQuizUnlockUpdate} from "../../types/Exam.ts";
import {ExamsApiUtils} from "../../utils/ExamsApiUtils.ts";
import {groupExamQuizzes} from "../../utils/ExamCatalogUtils.ts";
import {filterUnlockCandidates, isAlreadyUnlocked, isCurrentUnlockListRequest, isDiscordId} from "../../utils/ExamUnlockUtils.ts";
import {availableUserName, formatUserName} from "../../../lib/user-display-name.ts";
import {useNavigate, useSearchParams} from "@/src/dashboard/next-navigation";
import styles from "./ExamUnlockManager.module.css";

interface ExamUnlockManagerProps {
    quizzes: ExamQuizSummary[];
    users: AtcmhUser[];
    token: string;
}

const ExamUnlockManager = ({quizzes, users, token}: ExamUnlockManagerProps) => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const privateQuizFolders = useMemo(
        () => groupExamQuizzes([...quizzes.filter(quiz => quiz.isPrivate)].sort((a, b) => a.title.localeCompare(b.title))),
        [quizzes]
    );
    const requestedQuizId = searchParams.get("quiz") ?? "";
    const selectedQuizId = quizzes.some(quiz => quiz.id === requestedQuizId && quiz.isPrivate) ? requestedQuizId : "";
    const selectedQuizIdRef = useRef(selectedQuizId);
    const listRequestVersionRef = useRef(0);
    const [unlocks, setUnlocks] = useState<ExamQuizUnlock[]>([]);
    const [query, setQuery] = useState("");
    const [quizQuery, setQuizQuery] = useState("");
    const [accessQuery, setAccessQuery] = useState("");
    const [mobileView, setMobileView] = useState<"access" | "grant">("access");
    const [selectedUser, setSelectedUser] = useState<AtcmhUser | null>(null);
    const [manualDiscordId, setManualDiscordId] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [pendingDiscordId, setPendingDiscordId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const candidates = useMemo(() => filterUnlockCandidates(users, unlocks, query), [query, unlocks, users]);
    const usersById = useMemo(() => new Map(users.map(user => [user.id, user])), [users]);
    const visibleFolders = useMemo(() => privateQuizFolders.map(folder => ({...folder, quizzes: folder.quizzes.filter(quiz => quiz.title.toLowerCase().includes(quizQuery.trim().toLowerCase()) || quiz.id === selectedQuizId)})).filter(folder => folder.quizzes.length > 0), [privateQuizFolders, quizQuery, selectedQuizId]);
    const visibleUnlocks = useMemo(() => unlocks.filter(unlock => {
        const name = availableUserName(usersById.get(unlock.discordId)?.username) ?? availableUserName(unlock.userName) ?? "";
        return `${name} ${unlock.discordId}`.toLowerCase().includes(accessQuery.trim().toLowerCase());
    }), [accessQuery, unlocks, usersById]);

    useEffect(() => {
        selectedQuizIdRef.current = selectedQuizId;
        setSelectedUser(null);
        setQuery("");
        setManualDiscordId("");
    }, [selectedQuizId]);

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
    const selectedUserName = availableUserName(selectedUser?.username);
    const targetAlreadyUnlocked = isAlreadyUnlocked(unlocks, targetDiscordId);
    const canUnlock = (Boolean(selectedUser) || isDiscordId(manualDiscordId)) && !targetAlreadyUnlocked;
    const selectQuiz = (quizId: string) => {
        listRequestVersionRef.current += 1;
        setSelectedUser(null);
        setQuery("");
        setQuizQuery("");
        setAccessQuery("");
        setManualDiscordId("");
        setMobileView("access");
        navigate(quizId ? `/dashboard/exams/unlocks?quiz=${encodeURIComponent(quizId)}` : "/dashboard/exams/unlocks");
    };

    return <section className={styles.manager} aria-labelledby="unlock-heading">
        <div className={styles.heading}><h2 id="unlock-heading">Learner unlocks</h2><p>Choose a private quiz, then manage access.</p></div>
        <div className={styles.pickerSurface}><label className={styles.quizSearch}>Search private quizzes<input type="search" value={quizQuery} onChange={event => setQuizQuery(event.target.value)} placeholder="Search private quizzes"/></label>
        <label className={styles.quizPicker}>Private quiz<select value={selectedQuizId} onChange={event => selectQuiz(event.target.value)}>
            <option value="">Choose a private quiz</option>
            {visibleFolders.map(folder => <optgroup key={folder.name} label={folder.name}>
                {folder.quizzes.map(quiz => <option key={quiz.id} value={quiz.id}>{quiz.title}</option>)}
            </optgroup>)}
        </select></label></div>
        {!selectedQuizId ? <p className={styles.prompt}>Choose a private quiz to view and manage its learner unlocks.</p> : <div className={styles.workspace}>
            <div className={styles.mobileTabs} role="group" aria-label="Unlock workspace"><button type="button" aria-pressed={mobileView === "access"} onClick={() => setMobileView("access")}>Current access</button><button type="button" aria-pressed={mobileView === "grant"} onClick={() => setMobileView("grant")}>Grant access</button></div>
            <section className={`${styles.memberSection} ${mobileView === "access" ? styles.mobileHidden : ""}`} aria-labelledby="add-learner-heading">
                <h3 id="add-learner-heading">Grant access</h3>
                <label>Search Dashboard members<input value={query} onChange={event => { setQuery(event.target.value); setSelectedUser(null); }} placeholder="Username or Discord ID"/></label>
                {candidates.length > 0 && !selectedUser ? <div className={styles.results} aria-label="Matching members">{candidates.map(user => <button type="button" key={user.id} onClick={() => { setSelectedUser(user); setQuery(formatUserName(user.id, user.username)); setManualDiscordId(""); }}><strong>{formatUserName(user.id, user.username)}</strong><span>{user.id}</span></button>)}</div> : null}
                {selectedUser ? <p className={styles.selection}>Selected: <strong>{formatUserName(selectedUser.id, selectedUser.username)}</strong> <span>{selectedUser.id}</span></p> : <>
                    <details className={styles.manualId}><summary>Enter a Discord ID instead</summary><label>Manual Discord ID<input inputMode="numeric" value={manualDiscordId} onChange={event => setManualDiscordId(event.target.value)} aria-describedby="discord-id-help"/></label><p className={styles.help} id="discord-id-help">Enter the learner’s 15–20 digit Discord ID. A username will not be inferred.</p></details>
                    {targetAlreadyUnlocked ? <p className={styles.help} role="status">This learner is already unlocked for this quiz.</p> : null}
                </>}
                <button className={styles.unlockButton} type="button" disabled={!canUnlock || isLoading || Boolean(pendingDiscordId)} onClick={() => void updateUnlock({discordId: targetDiscordId, ...(selectedUserName ? {userName: selectedUserName} : {}), unlocked: true})}>{pendingDiscordId === targetDiscordId ? "Unlocking…" : "Unlock learner"}</button>
            </section>
            <section className={`${styles.listSection} ${mobileView === "grant" ? styles.mobileHidden : ""}`} aria-labelledby="current-unlocks-heading">
                <div className={styles.listHeading}><h3 id="current-unlocks-heading">Current access <span>{unlocks.length} learners</span></h3><label>Find learner<input type="search" value={accessQuery} onChange={event => setAccessQuery(event.target.value)} placeholder="Find learner"/></label></div>
                {isLoading ? <p aria-live="polite">Loading quiz unlocks…</p> : null}
                {!isLoading && !error && unlocks.length === 0 ? <p>No learners are currently unlocked for this quiz.</p> : null}
                {!isLoading && unlocks.length > 0 && visibleUnlocks.length === 0 ? <p>No learners match that search.</p> : null}
                {!isLoading && visibleUnlocks.length > 0 ? <ul>{visibleUnlocks.map(unlock => {
                    const name = availableUserName(usersById.get(unlock.discordId)?.username) ?? availableUserName(unlock.userName);
                    return <li key={unlock.discordId}><div><strong>{formatUserName(unlock.discordId, name)}</strong><span>Granted {new Date(unlock.unlockedAt).toLocaleDateString("en-GB", {day: "numeric", month: "short", year: "numeric"})}</span></div><button type="button" className={styles.lockButton} disabled={Boolean(pendingDiscordId)} onClick={() => void updateUnlock({discordId: unlock.discordId, ...(name ? {userName: name} : {}), unlocked: false})}>{pendingDiscordId === unlock.discordId ? "Removing…" : "Remove"}</button></li>;
                })}</ul> : null}
            </section>
        </div>}
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
    </section>;
};

export default ExamUnlockManager;
