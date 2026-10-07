import Link from "next/link";
import {ArrowLeftIcon} from "@phosphor-icons/react/dist/ssr/ArrowLeft";
import {ArrowRightIcon} from "@phosphor-icons/react/dist/ssr/ArrowRight";
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

export default function CourseReadingView({course, subsection, basePath, trackView = true, mode: viewMode = "learner", onSelect, onEdit}: {course: LearnerCourse; subsection?: string; basePath?: string; trackView?: boolean; mode?: "learner" | "admin"; onSelect?: (id: string) => void; onEdit?: () => void}) {
  const preview = viewMode === "admin";
  const recordsProgress = trackView && !preview;
  const sections = [...course.sections].sort((a, b) => a.sortOrder - b.sortOrder);
  const groups = orderedCourseGroups(course.sectionGroups, sections);
  const mode = course.navigationMode ?? "sequential";
  const completed = new Set(course.completedSectionIds);
  const selected = subsection ? sections.find(section => section.id === subsection) : resumeSubsection(sections, groups, mode, completed);
  if (!selected) notFound();
  const index = sections.findIndex(section => section.id === selected.id);
  const group = groups.find(item => item.id === selected.groupId) ?? groups[0];
  const accessible = sections.filter(section => preview || canOpenSubsection(section, sections, groups, mode, completed));
  const unlocked = accessible.some(section => section.id === selected.id);
  const previous = sections[index - 1];
  const next = sections[index + 1];
  const quizzes = new Map(course.quizzes.map(quiz => [quiz.id, quiz]));
  const document = parseCourseDocument(selected.document);
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

  const Container = preview ? "section" : "main";
  const previousAvailable = previous && (preview || canOpenSubsection(previous, sections, groups, mode, completed));
  const nextAvailable = next && (preview || completed.has(selected.id) || canOpenSubsection(next, sections, groups, mode, completed));
  return <Container className={styles.readerShell} data-course-page data-dashboard-surface>
    {recordsProgress ? <><DashboardExamSessionBootstrap/><CourseViewTracker courseId={course.id}/></> : null}
    <div className={styles.readerWorkspace}>
      <CourseOutline courseId={course.id} title={course.title} preview={preview} groups={groups} sections={sections} currentId={selected.id} completedIds={course.completedSectionIds} accessibleIds={accessible.map(section => section.id)} basePath={basePath} onSelect={onSelect} onEdit={onEdit}/>
      <div className={styles.readerMain}>
        <article className={`${styles.section} ${!unlocked ? styles.locked : ""}`} aria-labelledby={`section-${selected.id}`} data-course-section-id={selected.id}>
          <header className={styles.sectionHeader}>
            <div><span className={styles.sectionNumber}>{group?.title}</span><h2 id={`section-${selected.id}`}>{selected.title}</h2></div>
            <div className={styles.lessonPosition}><span>{index + 1} of {sections.length}</span><div className={styles.progressTrack} role="progressbar" aria-valuenow={index + 1} aria-valuemin={0} aria-valuemax={sections.length} aria-label="Lesson position"><span style={{width: `${(index + 1) / sections.length * 100}%`}}/></div></div>
            {completed.has(selected.id) ? <span className={styles.status}>Completed</span> : !unlocked ? <span className={styles.status}>Locked</span> : null}
          </header>
          {unlocked ? <div className={styles.sectionBody}>
            <CourseMarkdown sectionId={selected.id} courseId={course.id} document={document} blocks={parseCourseMarkdown(selected.markdown)} quizzes={quizzes} quizProgress={course.quizProgress} activities={course.activities} activityProgress={course.activityProgress} mode={viewMode} readerLayout suppressHeading={selected.title}/>
            {!completed.has(selected.id) && recordsProgress ? <CourseSectionCompletionButton courseId={course.id} sectionId={selected.id} nextHref={next ? subsectionHref(course.id, next.id, basePath) : undefined} disabled={requiredMissing} disabledReason={requiredMissing ? "Complete every required checkpoint on this page before marking it complete." : undefined}/> : null}
            <nav className={styles.pageNavigation} aria-label="Subsection navigation">
              {previousAvailable ? onSelect ? <button type="button" onClick={() => onSelect(previous.id)} aria-label={`Previous: ${previous.title}`}><ArrowLeftIcon size={18}/>Previous</button> : <Link href={subsectionHref(course.id, previous.id, basePath)} aria-label={`Previous: ${previous.title}`}><ArrowLeftIcon size={18}/>Previous</Link> : <button type="button" disabled><ArrowLeftIcon size={18}/>Previous</button>}
              {nextAvailable ? onSelect ? <button type="button" className={styles.nextLink} onClick={() => onSelect(next.id)} aria-label={`Next: ${next.title}`}>Next<ArrowRightIcon size={18}/></button> : <Link className={styles.nextLink} href={subsectionHref(course.id, next.id, basePath)} aria-label={`Next: ${next.title}`}>Next<ArrowRightIcon size={18}/></Link> : next ? <span className={styles.nextLocked}>Complete this subsection to continue</span> : <span className={styles.nextLocked}>End of course</span>}
            </nav>
          </div> : <div className={styles.sectionBody}><p className={styles.lockedCopy}>This subsection is not yet available in the course’s {mode.replaceAll("_", " ")} path.</p><Link className={styles.returnLink} href={subsectionHref(course.id, resumeSubsection(sections, groups, mode, completed)?.id ?? sections[0].id, basePath)}>Go to your next available subsection</Link></div>}
        </article>
      </div>
    </div>
  </Container>;
}
