"use client";

import {useEffect, useRef, useState} from "react";
import {currentSectionIndex} from "./course-section-position";
import styles from "./CourseSectionNav.module.css";

export default function CourseSectionNav({lessons}: {lessons: Array<{id: string; label: string}>}) {
    const navRef = useRef<HTMLElement>(null);
    const [activeId, setActiveId] = useState<string | null>(null);

    useEffect(() => {
        const nav = navRef.current;
        const section = nav?.parentElement;
        if (!nav || !section) return;
        let frame: number | null = null;
        const measure = () => {
            frame = null;
            const headings = lessons.flatMap(lesson => {
                const element = document.getElementById(lesson.id);
                return element && section.contains(element) ? [{id: lesson.id, top: element.getBoundingClientRect().top}] : [];
            });
            const bounds = section.getBoundingClientRect();
            const atPageBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
            const index = currentSectionIndex(headings.map(heading => heading.top), bounds.top, bounds.bottom, window.innerHeight, atPageBottom);
            setActiveId(index === null ? null : headings[index].id);
        };
        const schedule = () => {
            if (frame === null) frame = window.requestAnimationFrame(measure);
        };
        window.addEventListener("scroll", schedule, {passive: true});
        window.addEventListener("resize", schedule);
        window.addEventListener("hashchange", schedule);
        const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
        observer?.observe(section);
        schedule();
        return () => {
            window.removeEventListener("scroll", schedule);
            window.removeEventListener("resize", schedule);
            window.removeEventListener("hashchange", schedule);
            observer?.disconnect();
            if (frame !== null) window.cancelAnimationFrame(frame);
        };
    }, [lessons]);

    const activeIndex = lessons.findIndex(lesson => lesson.id === activeId);
    return <nav ref={navRef} className={styles.nav} aria-label="In this section">
        <p>In this section</p>
        {lessons.map((lesson, index) => <a key={lesson.id} href={`#${lesson.id}`} aria-current={lesson.id === activeId ? "location" : undefined}>
            <span className={styles.marker} aria-hidden="true">{lesson.id === activeId ? "●" : "○"}</span>
            <span>{lesson.label}</span>
            {lesson.id === activeId ? <span className={styles.status}>Current</span> : index < activeIndex ? <span className={styles.earlier}>Earlier</span> : null}
        </a>)}
    </nav>;
}
