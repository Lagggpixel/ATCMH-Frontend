"use client";

import {useState} from "react";
import type {ExamQuizSummary} from "../../types/Exam.ts";
import type {ManagedCourse} from "../../types/Course.ts";
import {parseCourseMarkdown} from "@/src/lib/course-markdown";
import {orderedCourseGroups} from "@/src/lib/course-navigation";
import CourseMarkdown from "@/src/app/exams/(learner)/courses/CourseMarkdown";
import readerStyles from "@/src/app/exams/(learner)/courses/CourseReader.module.css";
import styles from "./CourseCenter.module.css";

interface CoursePreviewProps {
    course: ManagedCourse;
    quizzes: ExamQuizSummary[];
    onEdit: () => void;
}

export default function CoursePreview({course, quizzes, onEdit}: CoursePreviewProps) {
    const sections = [...course.sections].sort((a, b) => a.sortOrder - b.sortOrder);
    const groups = orderedCourseGroups(course.sectionGroups, sections);
    const [selectedId, setSelectedId] = useState(sections[0]?.id);
    const selectedIndex = Math.max(0, sections.findIndex(section => section.id === selectedId));
    const selected = sections[selectedIndex];
    const group = groups.find(item => item.id === selected?.groupId);
    const quizMap = new Map(quizzes.map(quiz => [quiz.id, {
        id: quiz.id, title: quiz.title, description: quiz.description ?? "", categoryId: quiz.categoryId ?? "",
        category: quiz.category ?? "", feedbackMode: quiz.feedbackMode ?? "none", timeLimitSeconds: quiz.timeLimitSeconds ?? 0,
        randomizeQuestions: quiz.randomizeQuestions ?? false, isPrivate: quiz.isPrivate,
    }]));
    const outline = <nav className={styles.previewOutlineNav} aria-label="Preview outline">{groups.map((parent, groupIndex) => <details key={parent.id} open={parent.id === group?.id ? true : undefined}>
        <summary><span>Section {groupIndex + 1}</span><strong>{parent.title}</strong></summary>
        {sections.filter(section => section.groupId === parent.id).map(section => <button type="button" key={section.id} aria-current={section.id === selected?.id ? "page" : undefined} onClick={() => setSelectedId(section.id)}>{section.title}</button>)}
    </details>)}</nav>;

    return <section className={`${styles.preview} ${readerStyles.readerShell}`} aria-labelledby="course-preview-heading">
        <header className={styles.previewHero}>
            <div><h2 id="course-preview-heading">{course.title}</h2><p>Preview · progress is not recorded</p></div>
            <button type="button" className={styles.quietButton} onClick={onEdit}>Edit course</button>
        </header>
        <div className={styles.previewWorkspace}>
            <aside className={styles.previewSidebar}>{outline}</aside>
            <div className={styles.previewReader}>
                <details className={styles.previewMobileOutline}><summary>Course outline</summary>{outline}</details>
                {selected ? <article className={styles.previewPaper} key={selected.id}>
                    <div className={styles.previewSectionHeader}><span>Section {groups.findIndex(item => item.id === group?.id) + 1} · {group?.title}</span><h3>{selected.title}</h3></div>
                    <CourseMarkdown sectionId={selected.id} courseId={course.id} document={selected.document} blocks={parseCourseMarkdown(selected.markdown)} quizzes={quizMap} quizProgress={[]} activities={course.activities ?? []} activityProgress={[]} mode="admin" suppressHeading={selected.title}/>
                    <nav className={styles.previewPagination} aria-label="Preview subsection navigation">
                        {sections[selectedIndex - 1] ? <button type="button" onClick={() => setSelectedId(sections[selectedIndex - 1].id)}>Previous · {sections[selectedIndex - 1].title}</button> : <span/>}
                        {sections[selectedIndex + 1] ? <button type="button" onClick={() => setSelectedId(sections[selectedIndex + 1].id)}>Next · {sections[selectedIndex + 1].title}</button> : <span>End of course</span>}
                    </nav>
                </article> : <p>No subsections have been added.</p>}
            </div>
        </div>
    </section>;
}
