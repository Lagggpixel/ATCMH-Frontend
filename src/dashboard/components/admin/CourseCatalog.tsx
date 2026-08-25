import {useMemo, useState} from "react";
import type {ManagedCourseSummary} from "../../types/Course.ts";
import styles from "./CourseCenter.module.css";

interface CourseCatalogProps {
    courses: ManagedCourseSummary[];
    onEdit: (course: ManagedCourseSummary) => void;
    onPreview: (course: ManagedCourseSummary) => void;
    onStatistics: (course: ManagedCourseSummary) => void;
}

export default function CourseCatalog({courses, onEdit, onPreview, onStatistics}: CourseCatalogProps) {
    const [query, setQuery] = useState("");
    const filtered = useMemo(() => {
        const normalized = query.trim().toLocaleLowerCase();
        return courses.filter(course => !normalized || `${course.title} ${course.description} ${course.slug}`.toLocaleLowerCase().includes(normalized));
    }, [courses, query]);

    return <section className={styles.catalog} aria-label="Course catalog">
        <div className={styles.toolbar}>
            <label className={styles.search}><span className={styles.visuallyHidden}>Search courses</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search courses"/></label>
            <span className={styles.count}>{filtered.length} {filtered.length === 1 ? "course" : "courses"}</span>
        </div>
        {filtered.length === 0 ? <p className={styles.empty}>{courses.length === 0 ? "No courses have been created yet." : "No courses match this search."}</p> : <div className={styles.rows}>
            {filtered.map(course => <article className={styles.row} key={course.id}>
                <div><h3>{course.title}</h3><p>{course.description || "No description"}</p><code>/{course.slug}</code></div>
                <div className={styles.rowMeta}><span className={course.isPublished ? styles.published : styles.draft}>{course.isPublished ? "Available to learners" : "Draft"}</span><span>{course.sectionCount} {course.sectionCount === 1 ? "section" : "sections"}</span><button type="button" onClick={() => onPreview(course)}>Preview</button><button type="button" onClick={() => onStatistics(course)}>Statistics</button><button type="button" onClick={() => onEdit(course)}>Edit markdown</button></div>
            </article>)}
        </div>}
    </section>;
}
