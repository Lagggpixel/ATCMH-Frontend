import Link from "next/link";
import type {CoursePrerequisiteSummary} from "@/src/dashboard/types/Course";
import styles from "./CourseReader.module.css";

export default function CoursePrerequisiteStatus({prerequisites, hasUnavailablePrerequisites}: {
  prerequisites: CoursePrerequisiteSummary[];
  hasUnavailablePrerequisites: boolean;
}) {
  if (prerequisites.length === 0 && !hasUnavailablePrerequisites) return null;

  return <div className={styles.prerequisiteStatus}>
    <h3 className={styles.prerequisiteHeading}>Prerequisites</h3>
    {prerequisites.length > 0 ? <ul className={styles.prerequisiteList}>
      {prerequisites.map((prerequisite) => <li className={styles.prerequisiteItem} key={prerequisite.courseId}>
        <Link href={`/exams/courses/${encodeURIComponent(prerequisite.courseId)}`}>{prerequisite.title}</Link>
        <span className={prerequisite.completed ? styles.prerequisiteComplete : styles.prerequisiteIncomplete}>
          {prerequisite.completed ? "Completed" : "Not complete"}
        </span>
      </li>)}
    </ul> : null}
    {hasUnavailablePrerequisites ? <p className={styles.unavailablePrerequisites}>You cannot complete this course because a prerequisite course is private or unavailable. Contact an administrator for access.</p> : null}
  </div>;
}
