import Link from "next/link";
import { notFound } from "next/navigation";
import { courseQuizRequirementSatisfied, getCourseForLearner, linkedQuizSummaries, recordCourseAccess, sectionBlocks } from "@/src/lib/course-repository";
import { courseMarkdownReferences } from "@/src/lib/course-markdown";
import { getVerifiedLearnerIdentity } from "@/src/lib/learner-session";
import { homeLoginHref } from "@/src/platform/auth/login-routing";
import DashboardExamSessionBootstrap from "../../DashboardExamSessionBootstrap";
import CourseMarkdown from "../CourseMarkdown";
import CourseSectionCompletionButton from "../CourseSectionCompletionButton";
import styles from "../CourseReader.module.css";

export const dynamic = "force-dynamic";

export default async function CoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const identity = await getVerifiedLearnerIdentity();
  if (!identity) return <main className="learner-main"><div className={styles.coursePage}><DashboardExamSessionBootstrap/><section className={styles.privateGate} aria-labelledby="course-login-title"><p className={styles.eyebrow}>Private learning space</p><h1 id="course-login-title">Sign in to open this course</h1><p>Course material is only available to authenticated ATCMH learners.</p><Link href={homeLoginHref("exams", `/exams/courses/${encodeURIComponent(courseId)}`)}>Sign in</Link></section></div></main>;

  await recordCourseAccess(courseId, identity.discordId).catch(() => undefined);
  const course = await getCourseForLearner(courseId, identity.discordId);
  if (!course) notFound();
  const quizzes = await linkedQuizSummaries(course);
  const completed = new Set(course.completedSectionIds);
  const completionCount = course.sections.filter((section) => completed.has(section.id)).length;

  return <main className="learner-main">
    <div className={styles.coursePage}>
      <header className={styles.courseHeader}>
        <Link className={styles.backLink} href="/exams/courses">← Back to courses</Link>
        <p className={styles.eyebrow}>Private course</p>
        <h1>{course.title}</h1>
        <p className={styles.courseDescription}>{course.description}</p>
        <div className={styles.courseMeta}><span>{course.sections.length} {course.sections.length === 1 ? "section" : "sections"}</span><span>·</span><span>{completionCount} completed</span></div>
      </header>
      <div className={styles.progress} aria-label={`${completionCount} of ${course.sections.length} sections completed`}>
        <div className={styles.progressLabel}><span>Your progress</span><span>{completionCount}/{course.sections.length}</span></div>
        <div className={styles.progressTrack}><span style={{ width: `${course.sections.length ? (completionCount / course.sections.length) * 100 : 0}%` }}/></div>
      </div>
      <div className={styles.sectionList}>
        {course.sections.map((section, index) => {
          const isCompleted = completed.has(section.id);
          const isUnlocked = index === 0 || course.sections.slice(0, index).every((previous) => completed.has(previous.id));
          const blocks = sectionBlocks(section);
          const requiredMissing = courseMarkdownReferences(section.markdown).some((reference) => reference.type === "quiz" && !courseQuizRequirementSatisfied(reference, course.quizProgress));
          return <section className={`${styles.section} ${!isUnlocked && !isCompleted ? styles.locked : ""}`} key={section.id} aria-labelledby={`section-${section.id}`}>
            <header className={styles.sectionHeader}>
              <div><span className={styles.sectionNumber}>Section {index + 1}</span><h2 id={`section-${section.id}`}>{section.title}</h2></div>
              {isCompleted ? <span className={styles.status}>Completed</span> : !isUnlocked ? <span className={styles.status}>Locked</span> : null}
            </header>
            {isUnlocked || isCompleted ? <div className={styles.sectionBody}>
              <CourseMarkdown courseId={course.id} blocks={blocks} quizzes={quizzes} quizProgress={course.quizProgress}/>
              {!isCompleted ? <CourseSectionCompletionButton courseId={course.id} sectionId={section.id} disabled={requiredMissing} disabledReason={requiredMissing ? "Complete every required quiz checkpoint above before moving to the next section." : undefined}/> : null}
            </div> : <div className={styles.sectionBody}><p className={styles.lockedCopy}>Complete the previous section to unlock this material.</p></div>}
          </section>;
        })}
      </div>
    </div>
  </main>;
}
