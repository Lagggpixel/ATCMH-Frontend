import type {ExamQuizSummary} from "../../types/Exam.ts";
import type {ManagedCourse} from "../../types/Course.ts";
import {parseCourseMarkdown} from "@/src/lib/course-markdown";
import {ApiUtils} from "@/src/dashboard/utils/ApiUtils";
import CourseMarkdown from "@/src/app/exams/(learner)/courses/CourseMarkdown";
import styles from "./CourseCenter.module.css";

interface CoursePreviewProps {
    course: ManagedCourse;
    quizzes: ExamQuizSummary[];
    onEdit: () => void;
}

export default function CoursePreview({course, quizzes, onEdit}: CoursePreviewProps) {
    const quizMap = new Map(quizzes.map(quiz => [quiz.id, {
        id: quiz.id,
        title: quiz.title,
        description: quiz.description ?? "",
        categoryId: quiz.categoryId ?? "",
        category: quiz.category ?? "",
        feedbackMode: quiz.feedbackMode ?? "none",
        timeLimitSeconds: quiz.timeLimitSeconds ?? 0,
        randomizeQuestions: quiz.randomizeQuestions ?? false,
        isPrivate: quiz.isPrivate,
    }]));

    return <section className={styles.preview} aria-labelledby="course-preview-heading" data-api-origin={ApiUtils.apiOrigin}>
        <div className={styles.previewHeader}><div><p className={styles.eyebrow}>Moderator preview</p><h2 id="course-preview-heading">{course.title}</h2><p>{course.description || "No course description."}</p></div><div className={styles.previewHeaderActions}><span className={course.isPublished ? styles.published : styles.draft}>{course.isPublished ? "Published course" : "Private draft"}</span><button type="button" className={styles.quietButton} onClick={onEdit}>Edit course</button></div></div>
        <p className={styles.previewNotice}>This is a staff preview. It does not start enrollment, record course progress, or complete sections. Quiz and activity links are displayed without learner progress.</p>
        <div className={styles.previewSections}>{course.sections.map((section, index) => <article className={styles.previewSection} key={section.id ?? `${section.sortOrder}-${index}`}><header className={styles.previewSectionHeader}><span>Section {index + 1}</span><h3>{section.title}</h3></header><CourseMarkdown courseId={course.id} document={section.document} blocks={parseCourseMarkdown(section.markdown)} quizzes={quizMap} quizProgress={[]} activities={course.activities ?? []} activityProgress={[]} mode="admin"/></article>)}</div>
    </section>;
}
