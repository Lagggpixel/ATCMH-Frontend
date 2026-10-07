import Link from "next/link";
import {notFound} from "next/navigation";
import {CourseLockedError, getCourseForLearner} from "@/src/lib/course-api-client";
import {getVerifiedLearnerIdentity} from "@/src/lib/learner-session";
import {homeLoginHref} from "@/src/platform/auth/login-routing";
import DashboardExamSessionBootstrap from "../../DashboardExamSessionBootstrap";
import CourseReadingView from "../CourseReadingView";
import CoursePrerequisiteStatus from "../CoursePrerequisiteStatus";
import styles from "../CourseReader.module.css";

export const dynamic = "force-dynamic";

export default async function CoursePage({params, searchParams}: {
  params: Promise<{courseId: string}>;
  searchParams: Promise<{subsection?: string}>;
}) {
  const {courseId} = await params;
  const {subsection} = await searchParams;
  const identity = await getVerifiedLearnerIdentity();
  if (!identity) return <main className={`learner-main ${styles.catalogShell}`} data-course-page><div className={styles.coursePage}><DashboardExamSessionBootstrap/><section className={styles.privateGate} aria-labelledby="course-login-title"><h1 id="course-login-title">Sign in to open this course</h1><p>Course material is only available to authenticated ATCMH learners.</p><Link href={homeLoginHref("exams", `/exams/courses/${encodeURIComponent(courseId)}`)}>Sign in</Link></section></div></main>;

  let course: Awaited<ReturnType<typeof getCourseForLearner>>;
  try {
    course = await getCourseForLearner(courseId);
  } catch (reason) {
    if (!(reason instanceof CourseLockedError)) throw reason;
    return <main className="learner-main"><div className={styles.coursePage}><DashboardExamSessionBootstrap/><section className={styles.privateGate + " " + styles.privateGateLocked} aria-labelledby="course-locked-title">
      <Link className={styles.backLink} href="/exams/courses">← Back to courses</Link>
      <p className={styles.eyebrow}>Course</p>
      <h1 id="course-locked-title">Course is locked</h1>
      <p>Complete the available prerequisites below before opening this course.</p>
      <CoursePrerequisiteStatus prerequisites={reason.prerequisites} hasUnavailablePrerequisites={reason.hasUnavailablePrerequisites}/>
    </section></div></main>;
  }
  if (!course) notFound();
  return <CourseReadingView course={course} subsection={subsection}/>;
}
