import {useEffect, useState} from "react";
import {Link, NavLink, useNavigate, useParams} from "@/src/dashboard/next-navigation";
import type {ExamCategory, ExamManagementActor, ExamQuizSummary, ManagedExamQuiz} from "../../types/Exam.ts";
import type {AtcmhUser} from "../../types/AtcmhUser.ts";
import {
    EXAMS_AUTH_REQUIRED_EVENT,
    EXAMS_LOGIN_URL,
    ExamsApiUtils,
    isExamsAuthenticationRequired,
} from "../../utils/ExamsApiUtils.ts";
import AdminLoginScreen from "./AdminLoginScreen.tsx";
import ExamCatalog from "./ExamCatalog.tsx";
import ExamEditor from "./ExamEditor.tsx";
import {
    canAccessExamCenterView,
    canManageExamWebsite,
    isCurrentExamQuiz,
    type ExamCenterView,
} from "./ExamCenterAccess.ts";
import ExamImportCenter from "./ExamImportCenter.tsx";
import ExamUnlockManager from "./ExamUnlockManager.tsx";
import ExamWebsiteManager from "./ExamWebsiteManager.tsx";
import ExamAttemptManager from "./ExamAttemptManager.tsx";
import ExamAttemptReview from "./ExamAttemptReview.tsx";
import styles from "./ExamCenter.module.css";

export interface ExamCenterProps {
    token: string | null;
    users: AtcmhUser[];
    view: ExamCenterView;
}

interface ExamCenterData {
    actor: ExamManagementActor;
    quizzes: ExamQuizSummary[];
    categories: ExamCategory[];
}

interface ExamEditorRequest {
    requestedId: string;
    quiz: ManagedExamQuiz | null;
    error: string | null;
}

const hasCapability = (actor: ExamManagementActor, capability: ExamManagementActor["capabilities"][number]) => actor.capabilities.includes(capability);

const ExamCenter = ({token, users, view}: ExamCenterProps) => {
    const navigate = useNavigate();
    const {examId} = useParams<{ examId: string }>();
    const [data, setData] = useState<ExamCenterData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [examsAuthRequired, setExamsAuthRequired] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);
    const [editorRequest, setEditorRequest] = useState<ExamEditorRequest | null>(null);
    const [lastSavedQuizId, setLastSavedQuizId] = useState<string | null>(null);
    const canManageExams = data ? hasCapability(data.actor, "manage-exams") : false;

    useEffect(() => {
        const requireAuth = () => { setExamsAuthRequired(true); setError("Sign in to the Exams Center to use this workspace."); };
        window.addEventListener(EXAMS_AUTH_REQUIRED_EVENT, requireAuth);
        return () => window.removeEventListener(EXAMS_AUTH_REQUIRED_EVENT, requireAuth);
    }, []);

    useEffect(() => {
        if (!token) return;
        let active = true;
        setData(null);
        setError(null);
        setExamsAuthRequired(false);
        void (async () => {
            try {
                const [actor, quizzes] = await Promise.all([ExamsApiUtils.getManagementMe(token), ExamsApiUtils.listQuizzes(token)]);
                const categories = hasCapability(actor, "manage-exams") ? await ExamsApiUtils.listCategories(token) : [];
                if (active) setData({actor, quizzes, categories});
            } catch (reason) {
                if (active) {
                    setExamsAuthRequired(isExamsAuthenticationRequired(reason));
                    setError(reason instanceof Error ? reason.message : String(reason));
                }
            }
        })();
        return () => {
            active = false;
        };
    }, [reloadKey, token]);

    useEffect(() => {
        if (view !== "edit" || !examId || !token || !canManageExams) {
            setEditorRequest(null);
            return;
        }

        let active = true;
        setEditorRequest({requestedId: examId, quiz: null, error: null});
        void ExamsApiUtils.getQuiz(examId, token).then(quiz => {
            if (active) setEditorRequest({requestedId: examId, quiz, error: null});
        }).catch(reason => {
            if (active) setEditorRequest({
                requestedId: examId,
                quiz: null,
                error: reason instanceof Error ? reason.message : String(reason)
            });
        });
        return () => {
            active = false;
        };
    }, [canManageExams, examId, token, view]);

    const showQuizList = () => {
        setEditorRequest(null);
        navigate("/dashboard/exams");
    };
    const createQuiz = () => { setLastSavedQuizId(null); navigate("/dashboard/exams/new"); };
    const editQuiz = (quiz: ExamQuizSummary) => { setLastSavedQuizId(null); navigate(`/dashboard/exams/${quiz.id}/edit`); };
    const savedQuiz = (quiz: ExamQuizSummary) => {
        setData(current => current ? {
            ...current,
            quizzes: [...current.quizzes.filter(item => item.id !== quiz.id), quiz]
                .sort((left, right) => left.title.localeCompare(right.title)),
        } : current);
        setLastSavedQuizId(quiz.id);
        navigate("/dashboard/exams");
    };
    const retryAfterExamsLogin = () => { ExamsApiUtils.clearSessionCache(); setReloadKey(key => key + 1); };
    const createCategory = async (name: string) => {
        const category = await ExamsApiUtils.createCategory(name, token!);
        setData(current => current ? {
            ...current,
            categories: [...current.categories.filter(item => item.id !== category.id), category]
                .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id)),
        } : current);
        return category;
    };
    const moveQuizCategory = async (quiz: ExamQuizSummary, categoryId: string) => {
        const moved = await ExamsApiUtils.moveQuizCategory(quiz.id, categoryId, token!);
        setData(current => current ? {
            ...current,
            quizzes: current.quizzes.map(item => item.id === moved.id ? moved : item),
        } : current);
    };

    if (!token) return <AdminLoginScreen/>;

    const canAccessView = data ? canAccessExamCenterView(view, data.actor) : false;
    const editorRequestIsCurrent = isCurrentExamQuiz(examId, editorRequest?.requestedId ?? null);

    return <main className={styles.examCenter}>
        {data ? <nav className={styles.examNav} aria-label="Exam Center sections">
            {hasCapability(data.actor, "manage-exams") ? <NavLink end to="/dashboard/exams"
                                                                  className={({isActive}) => isActive ? styles.activeNavLink : undefined}>Quizzes</NavLink> : null}
            {hasCapability(data.actor, "unlock-learners") ? <NavLink to="/dashboard/exams/unlocks"
                                                                     className={({isActive}) => isActive ? styles.activeNavLink : undefined}>Unlocks</NavLink> : null}
            {hasCapability(data.actor, "review-attempts") ? <NavLink to="/dashboard/exams/attempts"
                                                                      className={({isActive}) => isActive ? styles.activeNavLink : undefined}>Attempts</NavLink> : null}
            {canManageExamWebsite(data.actor) ? <NavLink to="/dashboard/exams/website"
                                                         className={({isActive}) => isActive ? styles.activeNavLink : undefined}>Website
                content</NavLink> : null}
        </nav> : null}
        {data && view === "catalog" ? <section className={styles.headingActions} aria-label="Quiz actions">
                {hasCapability(data.actor, "import-exams") ?
                    <button type="button" onClick={() => navigate("/dashboard/exams/import")}
                            className={styles.secondaryAction}>Import</button> : null}
                {canManageExams ? <button type="button" onClick={createQuiz} className={styles.createButton}>Create
                    quiz</button> : null}
        </section> : null}
        {!data && !error ?
            <section className={styles.state} aria-live="polite"><p>Loading Exam Center…</p></section> : null}
        {error ? <section className={styles.state} role="alert"><h2>{examsAuthRequired ? "Your ATCMH session expired" : "Exam Center is unavailable"}</h2><p>{error}</p>
            {examsAuthRequired ? <a href={EXAMS_LOGIN_URL}>Sign in to ATCMH</a> : null}
            <button type="button" onClick={retryAfterExamsLogin}>{examsAuthRequired ? "Retry after signing in" : "Try again"}</button>
            <p className={styles.nonBlockingNote}>Other Dashboard sections are still available.</p></section> : null}
        {data ? <>
            {!canAccessView ?
                <section className={styles.state} role="alert"><h2>Access denied</h2><p>You do not have access to this
                    Exam Center workspace.</p><Link className={styles.backLink} to="/dashboard/exams">Back to Exam
                    Center</Link></section> : null}
            {canAccessView && view === "create" ?
                <ExamEditor quiz={null} categories={data.categories} token={token} onCancel={showQuizList} canManageFolders={data.actor.canManageAll}
                            onCreateCategory={data.actor.canManageAll ? createCategory : undefined} onSaved={savedQuiz}/> : null}
            {canAccessView && view === "edit" && editorRequestIsCurrent && editorRequest?.quiz ?
                <ExamEditor quiz={editorRequest.quiz} categories={data.categories} token={token} onCancel={showQuizList} canManageFolders={data.actor.canManageAll}
                            onCreateCategory={data.actor.canManageAll ? createCategory : undefined} onSaved={savedQuiz}/> : null}
            {canAccessView && view === "edit" && editorRequestIsCurrent && editorRequest?.error ?
                <section className={styles.state} role="alert"><p>{editorRequest.error}</p></section> : null}
            {canAccessView && view === "edit" && (!editorRequestIsCurrent || (!editorRequest?.quiz && !editorRequest?.error)) ?
                <section className={styles.state} aria-live="polite"><p>Loading exam editor…</p></section> : null}
            {canAccessView && view === "import" ? <ExamImportCenter actor={data.actor} token={token}/> : null}
            {canAccessView && view === "unlocks" ?
                <ExamUnlockManager quizzes={data.quizzes} users={users} token={token}/> : null}
            {canAccessView && view === "attempts" ? <ExamAttemptManager token={token} users={users}/> : null}
            {canAccessView && view === "attempt-review" ? <ExamAttemptReview actor={data.actor} token={token} users={users}/> : null}
            {canAccessView && view === "website" ? <ExamWebsiteManager token={token}/> : null}
            {canAccessView && view === "catalog" ? <>
                <ExamCatalog quizzes={data.quizzes} revealQuizId={lastSavedQuizId} onEdit={canManageExams ? editQuiz : undefined} categories={data.categories} onCreateCategory={data.actor.canManageAll ? async name => { await createCategory(name); } : undefined} onMoveQuizCategory={data.actor.canManageAll ? moveQuizCategory : undefined}/>
            </> : null}
        </> : null}
    </main>;
};

export default ExamCenter;
