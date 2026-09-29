import Link from "next/link";
import { homeLoginHref } from "@/src/platform/auth/login-routing";
import { getVerifiedLearnerIdentity } from "@/src/lib/learner-session";
import { listPublishedCourses } from "@/src/lib/course-api-client";
import DashboardExamSessionBootstrap from "../DashboardExamSessionBootstrap";
import styles from "./CourseReader.module.css";

export const dynamic = "force-dynamic";

export default async function CourseCataloguePage() {
  const identity = await getVerifiedLearnerIdentity();
  const courses = identity ? await listPublishedCourses().catch(() => []) : [];
  return <main className={`learner-main ${styles.catalogShell}`} data-course-page>
    <div className={styles.coursePage}>
      <DashboardExamSessionBootstrap />
      {!identity ? <section className={styles.privateGate} aria-labelledby="course-login-title">
        <p className={styles.eyebrow}>Private learning space</p>
        <h1 id="course-login-title">Sign in to view courses</h1>
        <p>Courses are only available to authenticated ATCMH learners. Sign in with your ATCMH account to continue.</p>
        <Link href={homeLoginHref("exams", "/exams/courses")}>Sign in</Link>
      </section> : <>
        <header className={styles.courseHeader}>
          <Link className={styles.backLink} href="/exams">← Back to Exam Center</Link>
          <h1>Courses</h1>
        </header>
        {courses.length === 0 ? <p className={styles.courseDescription}>No courses are available right now.</p> : <section className={styles.courseCatalogue} aria-label="Available courses">
          {courses.map((course) => <Link className={styles.courseCard} href={`/exams/courses/${course.id}`} key={course.id}>
            <span><h2>{course.title}</h2><p>{course.description || "A guided ATCMH learning course."}</p></span>
            <span className={styles.courseCardMeta}>Open course →</span>
          </Link>)}
        </section>}
      </>}
    </div>
  </main>;
}
