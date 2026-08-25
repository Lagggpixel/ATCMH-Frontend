import {useEffect, useState} from "react";
import {Link, NavLink, useNavigate} from "@/src/dashboard/next-navigation";
import type {ExamManagementActor, ExamQuizSummary} from "../../types/Exam.ts";
import type {AtcmhUser} from "../../types/AtcmhUser.ts";
import type {ManagedCourse, ManagedCourseSummary} from "../../types/Course.ts";
import {ExamsApiUtils, isExamsAuthenticationRequired, isExamsSessionHandoffFailure} from "../../utils/ExamsApiUtils.ts";
import CourseCatalog from "./CourseCatalog.tsx";
import CourseEditor from "./CourseEditor.tsx";
import CoursePreview from "./CoursePreview.tsx";
import CourseStatistics from "./CourseStatistics.tsx";
import styles from "./CourseCenter.module.css";

type CourseView = "courses" | "course-create" | "course-edit" | "course-preview" | "course-stats";

interface CourseCenterProps {
    actor: ExamManagementActor;
    quizzes: ExamQuizSummary[];
    users: AtcmhUser[];
    token: string;
    view: CourseView;
    courseId?: string;
}

export default function CourseCenter({actor, quizzes, users, token, view, courseId}: CourseCenterProps) {
    const navigate = useNavigate();
    const [courses, setCourses] = useState<ManagedCourseSummary[] | null>(null);
    const [course, setCourse] = useState<ManagedCourse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [authError, setAuthError] = useState(false);
    const [handoffError, setHandoffError] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        let active = true;
        setCourses(null);
        setError(null);
        void ExamsApiUtils.listCourses(token).then(next => { if (active) setCourses(next); }).catch(reason => {
            if (!active) return;
            setAuthError(isExamsAuthenticationRequired(reason));
            setHandoffError(isExamsSessionHandoffFailure(reason));
            setError(reason instanceof Error ? reason.message : String(reason));
        });
        return () => { active = false; };
    }, [reloadKey, token]);

    useEffect(() => {
        if ((view !== "course-edit" && view !== "course-preview" && view !== "course-stats") || !courseId) { setCourse(null); return; }
        let active = true;
        setCourse(null);
        void ExamsApiUtils.getCourse(courseId, token).then(next => { if (active) setCourse(next); }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
        return () => { active = false; };
    }, [courseId, token, view]);

    const refresh = () => setReloadKey(current => current + 1);
    const showCatalog = () => navigate("/dashboard/exams/courses");
    const saved = (savedCourse: ManagedCourse) => { refresh(); navigate(`/dashboard/exams/courses/${savedCourse.id}/edit`); };
    const showPreview = (selected: ManagedCourseSummary) => navigate(`/dashboard/exams/courses/${selected.id}/preview`);
    const showStatistics = (selected: ManagedCourseSummary) => navigate(`/dashboard/exams/courses/${selected.id}/stats`);
    const headingId = view === "courses" ? "course-center-heading" : view === "course-preview" ? "course-preview-heading" : view === "course-stats" ? "course-statistics-heading" : "course-editor-heading";

    return <section className={styles.center} aria-labelledby={headingId}>
        <nav className={styles.nav} aria-label="Course Center sections"><NavLink end to="/dashboard/exams/courses" className={({isActive}) => isActive ? styles.active : undefined}>Courses</NavLink>{courseId ? <NavLink to={`/dashboard/exams/courses/${courseId}/preview`} className={({isActive}) => isActive ? styles.active : undefined}>Preview</NavLink> : null}{courseId ? <NavLink to={`/dashboard/exams/courses/${courseId}/stats`} className={({isActive}) => isActive ? styles.active : undefined}>Statistics</NavLink> : null}<NavLink to="/dashboard/exams/courses/new" className={({isActive}) => isActive ? styles.active : undefined}>New course</NavLink></nav>
        {courses === null && !error ? <p className={styles.state} aria-live="polite">Loading Course Center…</p> : null}
        {error ? <section className={styles.state} role="alert"><h2>{handoffError ? "Could not connect Dashboard to Exams" : authError ? "Sign in to the Exams Center" : "Course Center is unavailable"}</h2><p>{error}</p>{authError && !handoffError ? <Link to="/exams">Open Exams sign in</Link> : null}<button type="button" onClick={refresh}>Try again</button></section> : null}
        {courses && view === "courses" ? <><div className={styles.headingActions}><div><p className={styles.eyebrow}>Private learning content</p><h2 id="course-center-heading">Courses</h2></div><button type="button" className={styles.createButton} onClick={() => navigate("/dashboard/exams/courses/new")}>Create course</button></div><CourseCatalog courses={courses} onEdit={selected => navigate(`/dashboard/exams/courses/${selected.id}/edit`)} onPreview={showPreview} onStatistics={showStatistics}/></> : null}
        {courses && view === "course-create" ? <CourseEditor course={null} quizzes={quizzes} token={token} canPublish={actor.canManageAll || actor.capabilities.includes("publish-exams")} onCancel={showCatalog} onSaved={saved}/> : null}
        {courses && view === "course-edit" ? course ? <CourseEditor course={course} quizzes={quizzes} token={token} canPublish={actor.canManageAll || actor.capabilities.includes("publish-exams")} onCancel={showCatalog} onPreview={() => navigate(`/dashboard/exams/courses/${course.id}/preview`)} onSaved={saved}/> : <p className={styles.state} aria-live="polite">Loading course editor…</p> : null}
        {courses && view === "course-preview" ? course ? <CoursePreview course={course} quizzes={quizzes} onEdit={() => navigate(`/dashboard/exams/courses/${course.id}/edit`)}/> : <p className={styles.state} aria-live="polite">Loading course preview…</p> : null}
        {courses && view === "course-stats" ? course ? <CourseStatistics course={course} users={users} token={token} onEdit={() => navigate(`/dashboard/exams/courses/${course.id}/edit`)}/> : <p className={styles.state} aria-live="polite">Loading course statistics…</p> : null}
    </section>;
}
