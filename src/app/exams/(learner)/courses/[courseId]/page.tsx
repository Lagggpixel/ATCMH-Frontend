import Link from "next/link";
import {notFound} from "next/navigation";
import {getCourseForLearner} from "@/src/lib/course-api-client";
import {getVerifiedLearnerIdentity} from "@/src/lib/learner-session";
import {homeLoginHref} from "@/src/platform/auth/login-routing";
import DashboardExamSessionBootstrap from "../../DashboardExamSessionBootstrap";
import CourseReadingView from "../CourseReadingView";
import styles from "../CourseReader.module.css";

export const dynamic = "force-dynamic";

export default async function CoursePage({params, searchParams}: {
  params: Promise<{courseId: string}>;
  searchParams: Promise<{subsection?: string}>;
}) {
  const {courseId} = await params;
  const {subsection} = await searchParams;
  const identity = await getVerifiedLearnerIdentity();
  if (!identity) return <main className="learner-main"><div className={styles.coursePage}><DashboardExamSessionBootstrap/><section className={styles.privateGate} aria-labelledby="course-login-title"><p className={styles.eyebrow}>Private learning space</p><h1 id="course-login-title">Sign in to open this course</h1><p>Course material is only available to authenticated ATCMH learners.</p><Link href={homeLoginHref("exams", `/exams/courses/${encodeURIComponent(courseId)}`)}>Sign in</Link></section></div></main>;

  const course = await getCourseForLearner(courseId);
  if (!course) notFound();
  return <CourseReadingView course={course} subsection={subsection}/>;
}
