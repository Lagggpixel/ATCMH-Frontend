"use client";

import {useEffect, useRef} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import type {ManagedCourseSection, ManagedCourseSectionGroup} from "@/src/dashboard/types/Course";
import {subsectionHref} from "@/src/lib/course-navigation";
import styles from "./CourseReader.module.css";

interface Props {
  courseId: string;
  groups: ManagedCourseSectionGroup[];
  sections: ManagedCourseSection[];
  currentId: string;
  completedIds: string[];
  accessibleIds: string[];
  basePath?: string;
}

export default function CourseOutline({courseId, groups, sections, currentId, completedIds, accessibleIds, basePath}: Props) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const completed = new Set(completedIds);
  const accessible = new Set(accessibleIds);
  const current = sections.find(section => section.id === currentId);
  const currentGroup = groups.find(group => group.id === current?.groupId) ?? groups[0];

  useEffect(() => {
    dialog.current?.close();
  }, [currentId]);

  const outline = (mobile: boolean) => <nav className={styles.outlineNav} aria-label="Course subsections">
    {groups.map((group, groupIndex) => {
      const children = sections.filter(section => section.groupId === group.id);
      return <details className={styles.outlineGroup} key={group.id} open={group.id === currentGroup?.id ? true : undefined}>
        <summary><span className={styles.outlineGroupNumber}>Section {groupIndex + 1}</span><strong>{group.title}</strong><span className={styles.outlineGroupCount}>{children.filter(section => completed.has(section.id)).length}/{children.length}</span></summary>
        <ol>{children.map(section => <li key={section.id}>
          {accessible.has(section.id) ? <Link aria-current={section.id === currentId ? "page" : undefined}
            className={section.id === currentId ? styles.outlineCurrent : ""}
            href={subsectionHref(courseId, section.id, basePath)} onClick={() => {if (mobile) dialog.current?.close();}}>
            <span className={`${styles.outlineMark} ${completed.has(section.id) ? styles.outlineDone : ""}`} aria-hidden="true"/>
            <span>{section.title}</span>
          </Link> : <span className={styles.outlineLocked} aria-label={`${section.title}, locked`}><span className={styles.outlineMark} aria-hidden="true"/><span>{section.title}</span></span>}
        </li>)}</ol>
      </details>;
    })}
  </nav>;

  return <>
    <div className={styles.sectionSwitcher}>
      <span className={styles.switcherCaption}>Section {Math.max(1, groups.findIndex(group => group.id === currentGroup?.id) + 1)} of {groups.length}</span>
      <label className={styles.visuallyHidden} htmlFor="course-section-switcher">Choose a course section</label>
      <select id="course-section-switcher" value={currentGroup?.id ?? ""} onChange={event => {
        const child = sections.find(section => section.groupId === event.target.value && accessible.has(section.id));
        if (child) router.push(subsectionHref(courseId, child.id, basePath));
      }}>
        {groups.map(group => <option key={group.id} value={group.id} disabled={!sections.some(section => section.groupId === group.id && accessible.has(section.id))}>{group.title}</option>)}
      </select>
    </div>
    <aside className={styles.desktopOutline} aria-label="Course outline">
      <div className={styles.outlineHeading}><span>Course outline</span></div>
      {outline(false)}
    </aside>
    <button ref={opener} type="button" className={styles.mobileOutlineButton} onClick={() => dialog.current?.showModal()} aria-haspopup="dialog">Course outline <span>{groups.length} sections</span></button>
    <dialog ref={dialog} className={styles.outlineDialog} aria-label="Course outline" onClose={() => opener.current?.focus()} onClick={event => {
      if (event.target === dialog.current) dialog.current.close();
    }}>
      <div className={styles.outlineDialogPanel}>
        <div className={styles.outlineHeading}><strong>Course outline</strong><button type="button" onClick={() => dialog.current?.close()}>Close</button></div>
        {outline(true)}
      </div>
    </dialog>
  </>;
}
