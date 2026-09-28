import Link from "next/link";
import {notFound} from "next/navigation";
import type {LearnerCourse} from "@/src/dashboard/types/Course";
import {courseMarkdownReferences, parseCourseMarkdown} from "@/src/lib/course-markdown";
import {courseDocumentReferences, parseCourseDocument} from "@/src/lib/course-document";
import {canOpenSubsection, orderedCourseGroups, resumeSubsection, subsectionHref} from "@/src/lib/course-navigation";
import DashboardExamSessionBootstrap from "../DashboardExamSessionBootstrap";
import CourseMarkdown from "./CourseMarkdown";
import CourseOutline from "./CourseOutline";
import CourseSectionCompletionButton from "./CourseSectionCompletionButton";
import CourseViewTracker from "./CourseViewTracker";
import styles from "./CourseReader.module.css";

export default function CourseReadingView({course, subsection, basePath, trackView = true}: {course: LearnerCourse; subsection?: string; basePath?: string; trackView?: boolean}) {
  const sections = [...course.sections].sort((a, b) => a.sortOrder - b.sortOrder);
  const groups = orderedCourseGroups(course.sectionGroups, sections);
  const mode = course.navigationMode ?? "sequential";
  const completed = new Set(course.completedSectionIds);
  const selected = subsection ? sections.find(section => section.id === subsection) : resumeSubsection(sections, groups, mode, completed);
  if (!selected) notFound();
  const index = sections.findIndex(section => section.id === selected.id);
  const group = groups.find(item => item.id === selected.groupId) ?? groups[0];
  const groupIndex = groups.findIndex(item => item.id === group?.id);
  const accessible = sections.filter(section => canOpenSubsection(section, sections, groups, mode, completed));
  const unlocked = accessible.some(section => section.id === selected.id);
  const previous = sections[index - 1];
  const next = sections[index + 1];
  const completionCount = sections.filter(section => completed.has(section.id)).length;
  const progressPercent = sections.length ? Math.round(completionCount / sections.length * 100) : 0;
  const quizzes = new Map(course.quizzes.map(quiz => [quiz.id, quiz]));
  const document = parseCourseDocument(selected.document);
  const headingCount = (document ? document.blocks.flatMap(block => block.type === "text" ? parseCourseMarkdown(block.markdown) : []) : parseCourseMarkdown(selected.markdown))
    .filter(block => block.type === "heading").length;
  const references = document ? courseDocumentReferences(document) : courseMarkdownReferences(selected.markdown).reduce<ReturnType<typeof courseDocumentReferences>>((result, reference) => {
    if (reference.type === "quiz") result.push({type: "quiz", id: reference.quizId, required: reference.required, ...(reference.passPercentage === undefined ? {} : {passPercent: reference.passPercentage})});
    if (reference.type === "activity") result.push({type: "activity", id: reference.activityId, required: reference.required, ...(reference.passPercentage === undefined ? {} : {passPercent: reference.passPercentage})});
    if (reference.type === "media") result.push({type: reference.kind, id: reference.mediaId, kind: reference.kind});
    return result;
  }, []);
  const requiredMissing = references.some(reference => {
    if (reference.type === "quiz" && reference.required) {
      const progress = course.quizProgress.find(item => item.quizId === reference.id);
      return !progress || progress.attemptCount === 0
        || (reference.passPercent !== undefined && progress.bestPercentage < reference.passPercent);
    }
    if (reference.type === "activity" && reference.required) {
      const progress = course.activityProgress.find(item => item.activityId === reference.id);
      return !progress?.passed || (reference.passPercent !== undefined && progress.bestScore < reference.passPercent);
    }
    return false;
  });

  return <main className={`learner-main ${styles.readerShell}`}>
    {trackView ? <><DashboardExamSessionBootstrap/><CourseViewTracker courseId={course.id}/></> : null}
    <div className={styles.readerHero}>
      <div className={styles.heroInner}>
        <Link className={styles.backLink} href="/exams/courses">All courses</Link>
        <p className={styles.heroEyebrow}>ATCMH · Guided course</p>
        <h1>{course.title}</h1>
        <p>{course.description || "A practical course for ATCMH learners."}</p>
      </div>
    </div>
    <div className={styles.readerToolbar}>
      <div className={styles.toolbarInner}>
        <div className={styles.toolbarSection}><span>Section {groupIndex + 1} of {groups.length}</span><strong>{group?.title}</strong></div>
        <div className={styles.toolbarProgress}><span>Course progress</span><div className={styles.progressTrack} role="progressbar" aria-valuenow={completionCount} aria-valuemin={0} aria-valuemax={sections.length} aria-label="Course progress"><span style={{width: `${progressPercent}%`}}/></div><strong>{progressPercent}% <small>({completionCount} of {sections.length})</small></strong></div>
      </div>
    </div>
    <div className={styles.readerWorkspace}>
      <CourseOutline courseId={course.id} groups={groups} sections={sections} currentId={selected.id} completedIds={course.completedSectionIds} accessibleIds={accessible.map(section => section.id)} basePath={basePath}/>
      <div className={styles.readerMain}>
        <div className={styles.readerContext}><span>Section {groupIndex + 1} · {group?.title}</span><h2>{selected.title}</h2></div>
        <article className={`${styles.section} ${!unlocked ? styles.locked : ""}`} aria-labelledby={`section-${selected.id}`} data-course-section-id={selected.id}>
          <header className={styles.sectionHeader}>
            <div><span className={styles.sectionNumber}>Section {groupIndex + 1} · {group?.title}</span><h2 id={`section-${selected.id}`}>{selected.title}</h2></div>
            {completed.has(selected.id) ? <span className={styles.status}>Completed</span> : !unlocked ? <span className={styles.status}>Locked</span> : null}
          </header>
          {unlocked ? <div className={styles.sectionBody}>
            <CourseMarkdown sectionId={selected.id} courseId={course.id} document={document} blocks={parseCourseMarkdown(selected.markdown)} quizzes={quizzes} quizProgress={course.quizProgress} activities={course.activities} activityProgress={course.activityProgress} suppressHeading={headingCount === 1 ? selected.title : undefined}/>
            {!completed.has(selected.id) && trackView ? <CourseSectionCompletionButton courseId={course.id} sectionId={selected.id} nextHref={next ? subsectionHref(course.id, next.id, basePath) : undefined} disabled={requiredMissing} disabledReason={requiredMissing ? "Complete every required checkpoint on this page before marking it complete." : undefined}/> : null}
            <nav className={styles.pageNavigation} aria-label="Subsection navigation">
              {previous && canOpenSubsection(previous, sections, groups, mode, completed) ? <Link href={subsectionHref(course.id, previous.id, basePath)}>Previous <span>{previous.title}</span></Link> : <span/>}
              {next && (completed.has(selected.id) || canOpenSubsection(next, sections, groups, mode, completed)) ? <Link className={styles.nextLink} href={subsectionHref(course.id, next.id, basePath)}>Next <span>{next.title}</span></Link> : next ? <span className={styles.nextLocked}>Complete this subsection to continue</span> : <span className={styles.nextLocked}>End of course</span>}
            </nav>
          </div> : <div className={styles.sectionBody}><p className={styles.lockedCopy}>This subsection is not yet available in the course’s {mode.replaceAll("_", " ")} path.</p><Link className={styles.returnLink} href={subsectionHref(course.id, resumeSubsection(sections, groups, mode, completed)?.id ?? sections[0].id, basePath)}>Go to your next available subsection</Link></div>}
        </article>
      </div>
    </div>
  </main>;
}
