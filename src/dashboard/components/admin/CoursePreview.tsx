"use client";

import {useState} from "react";
import type {ExamQuizSummary} from "../../types/Exam";
import type {LearnerCourse, ManagedCourse} from "../../types/Course";
import CourseReadingView from "@/src/app/exams/(learner)/courses/CourseReadingView";
import styles from "./CourseCenter.module.css";

export default function CoursePreview({course, quizzes, onEdit}: {course: ManagedCourse; quizzes: ExamQuizSummary[]; onEdit: () => void}) {
    const [selectedId, setSelectedId] = useState<string>();
    const previewCourse: LearnerCourse = {
        ...course, completedSectionIds: [], takenQuizIds: [], quizProgress: [], activityProgress: [], enrollment: null,
        activities: course.activities ?? [],
        quizzes: quizzes.map(quiz => ({
            id: quiz.id, title: quiz.title, description: quiz.description ?? "", categoryId: quiz.categoryId ?? "",
            category: quiz.category ?? "", feedbackMode: quiz.feedbackMode ?? "none", timeLimitSeconds: quiz.timeLimitSeconds ?? 0,
            randomizeQuestions: quiz.randomizeQuestions ?? false, isPrivate: quiz.isPrivate,
        })),
    };
    if (!course.sections.length) return <section className={styles.state}><h2 id="course-preview-heading">{course.title}</h2><p>No subsections have been added.</p><button type="button" className={styles.quietButton} onClick={onEdit}>Edit course</button></section>;
    return <CourseReadingView course={previewCourse} subsection={course.sections.some(section => section.id === selectedId) ? selectedId : undefined} trackView={false} mode="admin" onSelect={setSelectedId} onEdit={onEdit}/>;
}
