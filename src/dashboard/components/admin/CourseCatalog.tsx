import {useMemo, useState} from "react";
import type {ManagedCourseSummary} from "../../types/Course.ts";
import styles from "./CourseCenter.module.css";

interface CourseCatalogProps {
    courses: ManagedCourseSummary[];
    onEdit: (course: ManagedCourseSummary) => void;
    onPreview: (course: ManagedCourseSummary) => void;
    onStatistics: (course: ManagedCourseSummary) => void;
    onDelete: (course: ManagedCourseSummary) => void;
}

export default function CourseCatalog({courses, onEdit, onPreview, onStatistics, onDelete}: CourseCatalogProps) {
    const [query, setQuery] = useState("");
    const [status, setStatus] = useState("all");
    const publishedCount = courses.filter(course => course.isPublished).length;
    const filtered = useMemo(() => {
        const normalized = query.trim().toLocaleLowerCase();
        return courses.filter(course => (status === "all" || course.isPublished === (status === "published"))
            && (!normalized || `${course.title} ${course.description} ${course.slug}`.toLocaleLowerCase().includes(normalized)));
    }, [courses, query, status]);

    return <section className={styles.catalog} aria-label="Course catalog">
        <div className={styles.toolbar}>
            <div className={styles.catalogFilters} role="group" aria-label="Filter courses by status">
                {[["all", "All courses", courses.length], ["published", "Published", publishedCount], ["draft", "Drafts", courses.length - publishedCount]].map(([value, label, count]) =>
                    <button key={value} type="button" aria-pressed={status === value} onClick={() => setStatus(String(value))}>{label}<span>{count}</span></button>)}
            </div>
            <label className={styles.search}><span className={styles.visuallyHidden}>Search courses</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by title or description…"/></label>
        </div>
        <p className={styles.catalogResult} role="status">{filtered.length} {filtered.length === 1 ? "course" : "courses"}{query.trim() ? ` matching “${query.trim()}”` : ""}</p>
        {filtered.length === 0 ? <div className={styles.catalogEmpty}><h3>{courses.length === 0 ? "Your courses start here" : "No matching courses"}</h3><p>{courses.length === 0 ? "Create a course to organize lessons and learning activities." : "Try another search or show all courses."}</p>{courses.length > 0 ? <button type="button" className={styles.quietButton} onClick={() => {setQuery(""); setStatus("all");}}>Clear filters</button> : null}</div> : <div className={styles.courseList}>
            {filtered.map(course => <article className={styles.courseCard} key={course.id} aria-label={course.title}>
                <div className={styles.courseCardContent}>
                    <div className={styles.courseCardMeta}><span className={course.isPublished ? styles.published : styles.draft}>{course.isPublished ? "Published" : "Draft"}</span><span>{course.sectionCount} {course.sectionCount === 1 ? "section" : "sections"}</span></div>
                    <h3>{course.title}</h3>
                    <p>{course.description || "Add a description to help learners understand this course."}</p>
                </div>
                <div className={styles.courseCardFooter}>
                    <div className={styles.courseActions}><button type="button" className={styles.createButton} onClick={() => onEdit(course)}>Edit course</button><button type="button" className={styles.quietButton} onClick={() => onPreview(course)}>Preview</button><button type="button" className={styles.quietButton} onClick={() => onStatistics(course)}>Statistics</button></div>
                    <button type="button" className={styles.courseDelete} aria-label={`Delete ${course.title}`} onClick={() => onDelete(course)}>Delete</button>
                </div>
            </article>)}
        </div>}
    </section>;
}
