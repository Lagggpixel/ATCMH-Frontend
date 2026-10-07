import {useEffect, useState} from "react";
import {Link, NavLink, useNavigate} from "@/src/dashboard/next-navigation";
import type {ExamManagementActor, ExamQuizSummary} from "../../types/Exam.ts";
import type {AtcmhUser} from "../../types/AtcmhUser.ts";
import type {ManagedCourse, ManagedCourseSummary} from "../../types/Course.ts";
import {
    EXAMS_AUTH_REQUIRED_EVENT,
    EXAMS_LOGIN_URL,
    ExamsApiUtils,
    isExamsAuthenticationRequired,
} from "../../utils/ExamsApiUtils.ts";
import AdminLoginScreen from "./AdminLoginScreen.tsx";
import CourseCatalog from "./CourseCatalog.tsx";
import {canAccessCourseCenterView, type CourseCenterView} from "./CourseCenterAccess.ts";
import CourseDeleteDialog from "./CourseDeleteDialog.tsx";
import CourseEditor from "./CourseEditor.tsx";
import CoursePreview from "./CoursePreview.tsx";
import CourseStatistics from "./CourseStatistics.tsx";
import styles from "./CourseCenter.module.css";

interface CourseCenterProps {
    token: string | null;
    users: AtcmhUser[];
    view: CourseCenterView;
    courseId?: string;
}

interface CourseCenterData {
    actor: ExamManagementActor;
    quizzes: ExamQuizSummary[];
}

export default function CourseCenter({users, token, view, courseId}: CourseCenterProps) {
    const navigate = useNavigate();
    const [courses, setCourses] = useState<ManagedCourseSummary[] | null>(null);
    const [course, setCourse] = useState<ManagedCourse | null>(null);
    const [data, setData] = useState<CourseCenterData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [authError, setAuthError] = useState(false);
    const [deletion, setDeletion] = useState<{course: ManagedCourseSummary; onDeleted?: () => void} | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        const requireAuth = () => {
            setAuthError(true);
            setError("Sign in to the Course Center to use this workspace.");
        };
        window.addEventListener(EXAMS_AUTH_REQUIRED_EVENT, requireAuth);
        return () => window.removeEventListener(EXAMS_AUTH_REQUIRED_EVENT, requireAuth);
    }, []);

    useEffect(() => {
        if (!token) {
            setData(null);
            setCourses(null);
            setError(null);
            return;
        }
        let active = true;
        setData(null);
        setCourses(null);
        setError(null);
        setAuthError(false);
        void (async () => {
            try {
                const actor = await ExamsApiUtils.getManagementMe(token);
                if (!canAccessCourseCenterView("courses", actor)) {
                    if (active) {
                        setData({actor, quizzes: []});
                        setCourses([]);
                    }
                    return;
                }
                const [quizzes, nextCourses] = await Promise.all([
                    ExamsApiUtils.listQuizzes(token),
                    ExamsApiUtils.listCourses(token),
                ]);
                if (active) {
                    setData({actor, quizzes});
                    setCourses(nextCourses);
                }
            } catch (reason) {
                if (!active) return;
                const requiresAuth = isExamsAuthenticationRequired(reason);
                setAuthError(requiresAuth);
                setError(requiresAuth
                    ? "Sign in to the Course Center to use this workspace."
                    : reason instanceof Error ? reason.message : String(reason));
            }
        })();
        return () => { active = false; };
    }, [reloadKey, token]);

    useEffect(() => {
        if (!token || !data || !canAccessCourseCenterView("courses", data.actor)
            || (view !== "course-edit" && view !== "course-preview" && view !== "course-stats") || !courseId) {
            setCourse(null);
            return;
        }
        let active = true;
        setCourse(null);
        void ExamsApiUtils.getCourse(courseId, token).then(next => {
            if (active) setCourse(next);
        }).catch(reason => {
            if (active) setError(reason instanceof Error ? reason.message : String(reason));
        });
        return () => { active = false; };
    }, [courseId, data, token, view]);

    const deleteSelected = async () => {
        if (!token || !deletion) return;
        await ExamsApiUtils.deleteCourse(deletion.course.id, token);
        deletion.onDeleted?.();
        setCourses(current => current?.filter(item => item.id !== deletion.course.id) ?? null);
        setNotice(`“${deletion.course.title}” was deleted.`);
        setDeletion(null);
        if (view !== "courses") navigate("/dashboard/courses");
    };

    const refresh = () => setReloadKey(current => current + 1);
    const showCatalog = () => navigate("/dashboard/courses");
    const saved = (savedCourse: ManagedCourse) => { refresh(); navigate(`/dashboard/courses/${savedCourse.id}/edit`); };
    const showPreview = (selected: ManagedCourseSummary) => navigate(`/dashboard/courses/${selected.id}/preview`);
    const showStatistics = (selected: ManagedCourseSummary) => navigate(`/dashboard/courses/${selected.id}/stats`);
    const headingId = view === "courses" ? "course-center-heading" : view === "course-preview" ? "course-preview-heading" : view === "course-stats" ? "course-statistics-heading" : "course-editor-heading";
    const canAccessView = data ? canAccessCourseCenterView(view, data.actor) : false;

    if (!token) return <AdminLoginScreen/>;

    return <section className={`${styles.center} ${view === "course-preview" ? styles.readerCenter : ""}`} aria-labelledby={headingId}>
        {view !== "courses" && view !== "course-preview" ? <nav className={styles.nav} aria-label="Course Center sections"><NavLink end to="/dashboard/courses" className={({isActive}) => isActive ? styles.active : undefined}>Courses</NavLink>{courseId ? <NavLink to={`/dashboard/courses/${courseId}/preview`} className={({isActive}) => isActive ? styles.active : undefined}>Preview</NavLink> : null}{courseId ? <NavLink to={`/dashboard/courses/${courseId}/stats`} className={({isActive}) => isActive ? styles.active : undefined}>Statistics</NavLink> : null}<NavLink to="/dashboard/courses/new" className={({isActive}) => isActive ? styles.active : undefined}>New course</NavLink></nav> : null}
        {notice ? <p className={styles.state} role="status">{notice}</p> : null}
        {deletion ? <CourseDeleteDialog course={deletion.course} onCancel={() => setDeletion(null)} onConfirm={deleteSelected}/> : null}
        {data && !canAccessView ? <section className={styles.state} role="alert"><h2>Access denied</h2><p>You do not have access to this Course Center workspace.</p><Link to="/dashboard/courses">Back to Course Center</Link></section> : null}
        {courses === null && !error ? <p className={styles.state} aria-live="polite">Loading Course Center…</p> : null}
        {error ? <section className={styles.state} role="alert"><h2>{authError ? "Your ATCMH session expired" : "Course Center is unavailable"}</h2><p>{error}</p>{authError ? <a href={EXAMS_LOGIN_URL}>Sign in to ATCMH</a> : null}<button type="button" onClick={refresh}>Try again</button></section> : null}
        {courses && data && canAccessView && view === "courses" ? <><div className={styles.headingActions}><div><p className={styles.eyebrow}>Course management</p><h2 id="course-center-heading">Courses</h2><p className={styles.description}>Manage lessons, preview content, and track learner progress.</p></div><button type="button" className={styles.createButton} onClick={() => navigate("/dashboard/courses/new")}>Create course</button></div><CourseCatalog courses={courses} onEdit={selected => navigate(`/dashboard/courses/${selected.id}/edit`)} onPreview={showPreview} onStatistics={showStatistics} onDelete={selected => setDeletion({course: selected})}/></> : null}
        {courses && data && canAccessView && view === "course-create" ? <CourseEditor course={null} courses={courses} quizzes={data.quizzes} activities={[]} token={token} canPublish={data.actor.canManageAll || data.actor.capabilities.includes("publish-exams")} onCancel={showCatalog} onSaved={saved}/> : null}
        {courses && data && canAccessView && view === "course-edit" ? course ? <CourseEditor course={course} courses={courses} quizzes={data.quizzes} activities={course.activities ?? []} token={token} canPublish={data.actor.canManageAll || data.actor.capabilities.includes("publish-exams")} onCancel={showCatalog} onDelete={onDeleted => setDeletion({course, onDeleted})} onPreview={() => navigate(`/dashboard/courses/${course.id}/preview`)} onSaved={saved}/> : <p className={styles.state} aria-live="polite">Loading course editor…</p> : null}
        {courses && data && canAccessView && view === "course-preview" ? course ? <CoursePreview course={course} quizzes={data.quizzes} onEdit={() => navigate(`/dashboard/courses/${course.id}/edit`)}/> : <p className={styles.state} aria-live="polite">Loading course preview…</p> : null}
        {courses && data && canAccessView && view === "course-stats" ? course ? <CourseStatistics course={course} users={users} token={token} onEdit={() => navigate(`/dashboard/courses/${course.id}/edit`)}/> : <p className={styles.state} aria-live="polite">Loading course statistics…</p> : null}
    </section>;
}
