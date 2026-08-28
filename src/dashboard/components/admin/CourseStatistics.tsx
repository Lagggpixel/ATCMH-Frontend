import {useEffect, useMemo, useState} from "react";
import type {AtcmhUser} from "../../types/AtcmhUser.ts";
import type {CourseStatistics as CourseStatisticsData, ManagedCourse} from "../../types/Course.ts";
import {ExamsApiUtils} from "../../utils/ExamsApiUtils.ts";
import styles from "./CourseCenter.module.css";

interface CourseStatisticsProps {
    course: ManagedCourse;
    users: AtcmhUser[];
    token: string;
    onEdit: () => void;
}

const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat(undefined, {dateStyle: "medium", timeStyle: "short"}).format(new Date(value)) : "—";

const formatDuration = (seconds: number | null | undefined) => {
    const total = Math.max(0, Math.round(seconds ?? 0));
    if (total < 60) return `${total}s`;
    const minutes = Math.floor(total / 60);
    const remainingSeconds = total % 60;
    if (minutes < 60) return remainingSeconds ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
};

export default function CourseStatistics({course, users, token, onEdit}: CourseStatisticsProps) {
    const [statistics, setStatistics] = useState<CourseStatisticsData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const userNames = useMemo(() => new Map(users.map(user => [String(user.id), user.username])), [users]);
    const activityStatistics = statistics?.activities ?? [];

    useEffect(() => {
        let active = true;
        setStatistics(null);
        setError(null);
        void ExamsApiUtils.getCourseStatistics(course.id, token).then(next => { if (active) setStatistics(next); }).catch(reason => {
            if (active) setError(reason instanceof Error ? reason.message : String(reason));
        });
        return () => { active = false; };
    }, [course.id, token]);

    return <section className={styles.statistics} aria-labelledby="course-statistics-heading">
        <div className={styles.headingActions}>
            <div><p className={styles.eyebrow}>Learner reporting</p><h2 id="course-statistics-heading">{course.title}</h2><p className={styles.description}>All-time activity · refreshed when this page loads</p></div>
            <button type="button" className={styles.quietButton} onClick={onEdit}>Edit course</button>
        </div>
        {error ? <section className={styles.state} role="alert"><p>{error}</p></section> : null}
        {!statistics && !error ? <p className={styles.state} aria-live="polite">Loading course statistics…</p> : null}
        {statistics ? <>
            {statistics.totalLearnersStarted === 0 ? <p className={styles.empty}>No learner progress has been recorded yet.</p> : null}
            <div className={styles.statCards} aria-label="Course summary">
                <article className={styles.statCard}><span>Eligible learners</span><strong>{statistics.eligibleLearners}</strong></article>
                <article className={styles.statCard}><span>Take rate</span><strong>{statistics.takeRate}%</strong></article>
                <article className={styles.statCard}><span>Learners started</span><strong>{statistics.totalLearnersStarted}</strong></article>
                <article className={styles.statCard}><span>Viewed learners</span><strong>{statistics.viewedLearners}</strong></article>
                <article className={styles.statCard}><span>View rate</span><strong>{statistics.viewRate}%</strong></article>
                <article className={styles.statCard}><span>Total view time</span><strong>{formatDuration(statistics.totalViewTimeSeconds)}</strong></article>
                <article className={styles.statCard}><span>Average view time</span><strong>{statistics.averageViewTimeSeconds === null ? "—" : formatDuration(statistics.averageViewTimeSeconds)}</strong></article>
                <article className={styles.statCard}><span>Activity pass rate</span><strong>{statistics.activityAttemptedLearnerCount === 0 ? "—" : `${statistics.activityPassRate}%`}</strong></article>
                <article className={styles.statCard}><span>In progress</span><strong>{statistics.learnersInProgress}</strong></article>
                <article className={styles.statCard}><span>Completed</span><strong>{statistics.learnersCompleted}</strong></article>
                <article className={styles.statCard}><span>Completion rate</span><strong>{statistics.completionRate}%</strong></article>
                <article className={styles.statCard}><span>Active in 30 days</span><strong>{statistics.activeLearners30d}</strong></article>
                <article className={styles.statCard}><span>Average completion</span><strong>{statistics.averageCompletionDays === null ? "—" : `${statistics.averageCompletionDays}d`}</strong></article>
            </div>
            <div className={styles.statisticsGrid}>
                <section className={styles.statisticsPanel} aria-labelledby="course-learners-heading">
                    <div className={styles.panelHeading}><h3 id="course-learners-heading">Learners</h3><span>{statistics.learners.length}</span></div>
                    {statistics.learners.length === 0 ? <p className={styles.empty}>No learners have opened this course.</p> : <div className={styles.tableWrap}><table><thead><tr><th>Learner</th><th>Status</th><th>Sections</th><th>Viewed</th><th>View time</th><th>Last active</th><th>Completed</th></tr></thead><tbody>{statistics.learners.map(learner => <tr key={learner.userId}><td><strong>{userNames.get(learner.userId) ?? learner.userId}</strong>{userNames.has(learner.userId) ? <small>{learner.userId}</small> : null}</td><td><span className={learner.status === "completed" ? styles.published : styles.draft}>{learner.status === "completed" ? "Completed" : "In progress"}</span></td><td>{learner.completedSectionCount}/{course.sections.length}</td><td>{learner.viewed ? "Yes" : "No"}</td><td>{formatDuration(learner.viewTimeSeconds)}</td><td>{formatDate(learner.lastAccessedAt)}</td><td>{formatDate(learner.completedAt)}</td></tr>)}</tbody></table></div>}
                </section>
                <section className={styles.statisticsPanel} aria-labelledby="course-sections-heading">
                    <div className={styles.panelHeading}><h3 id="course-sections-heading">Section progress</h3><span>{statistics.sections.length}</span></div>
                    <div className={styles.tableWrap}><table><thead><tr><th>Section</th><th>Completed</th><th>Rate</th></tr></thead><tbody>{statistics.sections.map(section => <tr key={section.sectionId}><td><strong>{section.sortOrder}. {section.title}</strong></td><td>{section.completedCount}/{statistics.totalLearnersStarted}</td><td><div className={styles.meter}><span style={{width: `${section.completionRate}%`}}/></div><small>{section.completionRate}%</small></td></tr>)}</tbody></table></div>
                </section>
            </div>
            <section className={styles.statisticsPanel} aria-labelledby="course-checkpoints-heading">
                <div className={styles.panelHeading}><h3 id="course-checkpoints-heading">Quiz checkpoints</h3><span>{statistics.quizzes.length}</span></div>
                {statistics.quizzes.length === 0 ? <p className={styles.empty}>This course has no linked quiz checkpoints.</p> : <div className={styles.tableWrap}><table><thead><tr><th>Quiz</th><th>Rule</th><th>Attempts</th><th>Qualified learners</th></tr></thead><tbody>{statistics.quizzes.map(quiz => <tr key={quiz.quizId}><td><strong>{quiz.title}</strong><small>{quiz.quizId}</small></td><td>{quiz.required ? quiz.passPercentage === null ? "Required" : `Pass ${quiz.passPercentage}%` : "Optional"}</td><td>{quiz.attemptCount} ({quiz.attemptedLearnerCount} learners)</td><td>{quiz.qualifiedLearnerCount}/{statistics.totalLearnersStarted} ({quiz.qualificationRate}%)</td></tr>)}</tbody></table></div>}
            </section>
            <section className={styles.statisticsPanel} aria-labelledby="course-activities-heading">
                <div className={styles.panelHeading}><h3 id="course-activities-heading">Activity checkpoints</h3><span>{activityStatistics.length}</span></div>
                {activityStatistics.length === 0 ? <p className={styles.empty}>This course has no linked typed activities.</p> : <div className={styles.tableWrap}><table><thead><tr><th>Activity</th><th>Rule</th><th>Attempts</th><th>Passed learners</th><th>Pass rate</th></tr></thead><tbody>{activityStatistics.map(activity => <tr key={activity.activityId}><td><strong>{activity.title}</strong><small>{activity.activityId}</small></td><td>{activity.required ? `Pass ${activity.passPercentage}%` : "Optional"}</td><td>{activity.attemptCount} ({activity.attemptedLearnerCount} learners)</td><td>{activity.passedLearnerCount}</td><td>{activity.passRate}%</td></tr>)}</tbody></table></div>}
            </section>
        </> : null}
    </section>;
}
