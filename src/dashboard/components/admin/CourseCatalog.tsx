import {useMemo, useState} from "react";
import {MagnifyingGlassIcon} from "@phosphor-icons/react/MagnifyingGlass";
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
    const filtered = useMemo(() => {
        const normalized = query.trim().toLocaleLowerCase();
        return courses.filter(course => (status === "all" || course.isPublished === (status === "published"))
            && (!normalized || `${course.title} ${course.description} ${course.slug}`.toLocaleLowerCase().includes(normalized)));
    }, [courses, query, status]);

    return <section className={styles.catalog} aria-label="Course catalog">
        <div className={styles.toolbar}>
            <div className={styles.catalogFilters} role="group" aria-label="Filter courses by status">
                {[["all", "All courses"], ["published", "Published"], ["draft", "Drafts"]].map(([value, label]) =>
                    <button key={value} type="button" aria-pressed={status === value} onClick={() => setStatus(value)}>{label}</button>)}
            </div>
            <label className={styles.search}><span className={styles.visuallyHidden}>Search courses</span><MagnifyingGlassIcon className={styles.searchIcon} size={20} aria-hidden="true"/><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search courses…"/></label>
        </div>
        <p className={styles.visuallyHidden} role="status">{filtered.length} {filtered.length === 1 ? "course" : "courses"}{query.trim() ? ` matching “${query.trim()}”` : ""}</p>
        {filtered.length === 0 ? <div className={styles.catalogEmpty}><h3>{courses.length === 0 ? "No courses yet" : "No matching courses"}</h3>{courses.length > 0 ? <button type="button" className={styles.quietButton} onClick={() => {setQuery(""); setStatus("all");}}>Clear filters</button> : null}</div> : <div className={styles.courseList}>
            {filtered.map(course => <article className={styles.courseCard} key={course.id} aria-label={course.title}>
                <div className={styles.courseCardContent}>
                    <div className={styles.courseCardMeta}><span className={course.isPublished ? styles.published : styles.draft}>{course.isPublished ? "Published" : "Draft"}</span></div>
                    <h3>{course.title}</h3>
                    <p>{course.description || "No description added."}</p>
                </div>
                <div className={styles.courseCardFooter}>
                    <div className={styles.courseActions}><button type="button" className={styles.createButton} onClick={() => onEdit(course)}>Edit course</button><button type="button" className={`${styles.quietButton} ${styles.desktopAction}`} onClick={() => onPreview(course)}>Preview</button><button type="button" className={`${styles.quietButton} ${styles.desktopAction}`} onClick={() => onStatistics(course)}>Statistics</button></div>
                    <details className={styles.courseMenu}>
                        <summary aria-label={`More actions for ${course.title}`}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg></summary>
                        <div className={styles.courseMenuPanel}>
                            <button type="button" className={styles.mobileMenuAction} onClick={event => {event.currentTarget.closest("details")?.removeAttribute("open"); onPreview(course);}}>Preview</button>
                            <button type="button" className={styles.mobileMenuAction} onClick={event => {event.currentTarget.closest("details")?.removeAttribute("open"); onStatistics(course);}}>Statistics</button>
                            <button type="button" className={styles.courseDelete} onClick={event => {event.currentTarget.closest("details")?.removeAttribute("open"); onDelete(course);}}>Delete course</button>
                        </div>
                    </details>
                </div>
            </article>)}
        </div>}
    </section>;
}
