"use client";

import {useEffect, useRef} from "react";
import Link from "next/link";
import {CaretDownIcon} from "@phosphor-icons/react/CaretDown";
import {CaretLeftIcon} from "@phosphor-icons/react/CaretLeft";
import {CircleIcon} from "@phosphor-icons/react/Circle";
import {CheckCircleIcon} from "@phosphor-icons/react/CheckCircle";
import type {ManagedCourseSection, ManagedCourseSectionGroup} from "@/src/dashboard/types/Course";
import {subsectionHref} from "@/src/lib/course-navigation";
import styles from "./CourseReader.module.css";

interface Props {
  courseId: string;
  title: string;
  groups: ManagedCourseSectionGroup[];
  sections: ManagedCourseSection[];
  currentId: string;
  completedIds: string[];
  accessibleIds: string[];
  basePath?: string;
  preview?: boolean;
  onSelect?: (id: string) => void;
  onEdit?: () => void;
}

export default function CourseOutline({courseId, title, groups, sections, currentId, completedIds, accessibleIds, basePath, preview = false, onSelect, onEdit}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const completed = new Set(completedIds);
  const accessible = new Set(accessibleIds);
  const current = sections.find(section => section.id === currentId);
  const currentGroup = groups.find(group => group.id === current?.groupId) ?? groups[0];
  const position = Math.max(1, sections.findIndex(section => section.id === currentId) + 1);
  const progressValue = preview ? position : sections.filter(section => completed.has(section.id)).length;

  useEffect(() => { dialog.current?.close(); }, [currentId]);

  const identity = (mobile: boolean) => <div className={styles.outlineCourse}>
    <Link className={styles.courseBack} href={preview ? "/dashboard/courses" : "/exams/courses"}><CaretLeftIcon size={18}/><span role="heading" aria-level={1} id={mobile ? "course-mobile-heading" : preview ? "course-preview-heading" : "course-reader-heading"}>{title}</span></Link>
    <p>{preview ? "Staff course preview" : "Your course"}</p>
    <div className={styles.outlineProgress}><div className={styles.progressTrack} role="progressbar" aria-label={preview ? "Preview lesson position" : "Course completion"} aria-valuenow={progressValue} aria-valuemin={0} aria-valuemax={sections.length}><span style={{width: `${sections.length ? progressValue / sections.length * 100 : 0}%`}}/></div><span>{progressValue} of {sections.length}</span></div>
    {onEdit ? <button type="button" className={styles.editCourse} onClick={onEdit}>Edit course</button> : null}
  </div>;

  const outline = (mobile: boolean) => <nav className={styles.outlineNav} aria-label="Course subsections">
    {groups.map((group, groupIndex) => {
      const children = sections.filter(section => section.groupId === group.id);
      return <details className={styles.outlineGroup} key={group.id} open={group.id === currentGroup?.id ? true : undefined}>
        <summary><span className={styles.outlineGroupNumber}>Section {groupIndex + 1}</span><strong>{group.title}</strong><CaretDownIcon className={styles.groupCaret} size={18}/></summary>
        <ol>{children.map(section => {
          const active = section.id === currentId;
          const marker = completed.has(section.id) ? <CheckCircleIcon className={styles.outlineMark} size={16} weight="fill"/> : <CircleIcon className={styles.outlineMark} size={16} weight={active ? "fill" : "regular"}/>;
          const content = <>{marker}<span>{section.title}</span></>;
          return <li key={section.id}>{accessible.has(section.id) ? onSelect ? <button type="button" aria-current={active ? "page" : undefined} className={active ? styles.outlineCurrent : ""} onClick={() => {onSelect(section.id); if (mobile) dialog.current?.close();}}>{content}</button> : <Link aria-current={active ? "page" : undefined} className={active ? styles.outlineCurrent : ""} href={subsectionHref(courseId, section.id, basePath)} onClick={() => {if (mobile) dialog.current?.close();}}>{content}</Link> : <span className={styles.outlineLocked} aria-label={`${section.title}, locked`}>{content}</span>}</li>;
        })}</ol>
      </details>;
    })}
  </nav>;

  return <>
    <aside className={styles.desktopOutline} aria-label="Course outline">{identity(false)}{outline(false)}</aside>
    <div className={styles.mobileCourseHeading}>{identity(true)}</div>
    <button ref={opener} type="button" className={styles.mobileOutlineButton} onClick={() => dialog.current?.showModal()} aria-haspopup="dialog">Course outline <span>{position} of {sections.length}<CaretDownIcon size={18}/></span></button>
    <dialog ref={dialog} className={styles.outlineDialog} aria-label="Course outline" onClose={() => opener.current?.focus()} onClick={event => {if (event.target === dialog.current) dialog.current.close();}}>
      <div className={styles.outlineDialogPanel}>
        <div className={styles.outlineHeading}><strong>{title}</strong><button type="button" onClick={() => dialog.current?.close()}>Close</button></div>
        {outline(true)}
      </div>
    </dialog>
  </>;
}
