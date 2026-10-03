import Link from "next/link";
import type {Metadata} from "next";
import { homeLoginHref } from "@/src/platform/auth/login-routing";
import { getVerifiedLearnerIdentity } from "@/src/lib/learner-session";
import { listPublishedCourses } from "@/src/lib/course-api-client";
import CourseCatalogue from "@/src/learning/CourseCatalogue";
import type {ManagedCourseSummary} from "@/src/dashboard/types/Course";
import DashboardExamSessionBootstrap from "../DashboardExamSessionBootstrap";
import styles from "./CourseReader.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {title: "Courses"};

export default async function CourseCataloguePage() {
  const identity = await getVerifiedLearnerIdentity();
  let courses: ManagedCourseSummary[] = [];
  let unavailable = false;
  if (identity) {
    try { courses = await listPublishedCourses(); }
    catch { unavailable = true; }
  }
  if (identity) return <><DashboardExamSessionBootstrap/><CourseCatalogue courses={courses} unavailable={unavailable}/></>;
  return <main className={`learner-main ${styles.catalogShell}`} data-course-page>
    <div className={styles.coursePage}>
      <DashboardExamSessionBootstrap />
      <section className={styles.privateGate} aria-labelledby="course-login-title">
        <p className={styles.eyebrow}>Private learning space</p>
        <h1 id="course-login-title">Sign in to view courses</h1>
        <p>Courses are only available to authenticated ATCMH learners. Sign in with your ATCMH account to continue.</p>
        <Link href={homeLoginHref("exams", "/exams/courses")}>Sign in</Link>
      </section>
    </div>
  </main>;
}
