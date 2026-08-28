import Link from "next/link";
import type {ReactNode} from "react";
import type {CourseActivity, CourseActivityProgress, CourseQuizProgress} from "@/src/dashboard/types/Course";
import type {QuizSummary} from "@/src/lib/exams-repository";
import {parseCourseDocument, type CourseDocumentV1, type CourseMediaBlock} from "@/src/lib/course-document";
import {parseCourseMarkdown, type CourseMarkdownBlock} from "@/src/lib/course-markdown";
import {ApiUtils} from "@/src/dashboard/utils/ApiUtils";
import CourseActivityCard from "./CourseActivityCard";
import CourseDiagram from "./CourseDiagram";
import styles from "./CourseReader.module.css";

function safeHref(value: string) {
  return /^https?:\/\//i.test(value) || (value.startsWith("/") && !value.startsWith("//")) ? value : undefined;
}

function renderInline(text: string): ReactNode[] {
  const tokens = /(\*\*[^*]+\*\*|`[^`]+`|\[([^\]]+)\]\(([^)]+)\))/g;
  const children: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = tokens.exec(text))) {
    if (match.index > cursor) children.push(text.slice(cursor, match.index));
    const token = match[0];
    if (token.startsWith("**")) children.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("`")) children.push(<code key={key++}>{token.slice(1, -1)}</code>);
    else {
      const href = safeHref(match[3]);
      children.push(href ? <a key={key++} href={href} target={href.startsWith("http") ? "_blank" : undefined} rel={href.startsWith("http") ? "noreferrer" : undefined}>{match[2]}</a> : match[2]);
    }
    cursor = match.index + token.length;
  }
  if (cursor < text.length) children.push(text.slice(cursor));
  return children;
}

interface CourseMarkdownProps {
  courseId: string;
  blocks?: CourseMarkdownBlock[];
  document?: CourseDocumentV1 | string | null;
  quizzes: Map<string, QuizSummary>;
  quizProgress: CourseQuizProgress[];
  activities?: CourseActivity[];
  activityProgress?: CourseActivityProgress[];
  mode?: "learner" | "admin";
}

function mediaSource(courseId: string, mediaId: string, mode: "learner" | "admin") {
  return mode === "admin"
    ? `${ApiUtils.apiOrigin}/admin/courses/${encodeURIComponent(courseId)}/media/${encodeURIComponent(mediaId)}`
    : `${ApiUtils.apiOrigin}/courses/media/${encodeURIComponent(mediaId)}`;
}

function renderQuiz(courseId: string, block: {quizId: string; required: boolean; passPercent?: number; passPercentage?: number}, quizzes: Map<string, QuizSummary>, quizProgress: CourseQuizProgress[], key: string) {
  const quiz = quizzes.get(block.quizId);
  const progress = quizProgress.find(item => item.quizId === block.quizId);
  const taken = Boolean(progress && progress.attemptCount > 0);
  const passPercent = block.passPercent ?? block.passPercentage;
  const passed = taken && (passPercent === undefined || (progress?.bestPercentage ?? 0) >= passPercent);
  return <aside className={styles.quizCard} key={key} aria-label={block.required ? "Required quiz" : "Course quiz"}>
    <div><p className={styles.quizEyebrow}>{block.required ? passPercent === undefined ? "Required checkpoint" : `Required · pass ${passPercent}%` : "Knowledge check"}</p><h3>{quiz?.title ?? "Linked quiz unavailable"}</h3><p>{quiz?.description || "Take this quiz to check your understanding of the section."}</p>{taken ? <span className={passed ? styles.quizComplete : styles.quizIncomplete}>{passPercent === undefined ? "Attempt recorded" : passed ? `Passed · best score ${progress?.bestPercentage ?? 0}%` : `Best score ${progress?.bestPercentage ?? 0}% · need ${passPercent}%`}</span> : null}</div>
    {quiz ? <Link className={styles.quizAction} href={`/exams/quizzes/${quiz.id}?courseId=${encodeURIComponent(courseId)}`}>{passed ? "Review quiz" : taken ? "Retake quiz" : "Take quiz"}</Link> : null}
  </aside>;
}

function renderMedia(courseId: string, block: CourseMediaBlock, mode: "learner" | "admin", key: string) {
  const src = mediaSource(courseId, block.mediaId, mode);
  const className = `${styles.media} ${styles[`media${block.width[0].toUpperCase()}${block.width.slice(1)}`] ?? ""} ${styles[`align${block.align[0].toUpperCase()}${block.align.slice(1)}`] ?? ""}`;
  return <figure className={className} key={key}>{block.kind === "image" ? <img src={src} alt={block.alt || "Course image"} loading="lazy"/> : <video src={src} controls={block.controls ?? true} poster={block.posterMediaId ? mediaSource(courseId, block.posterMediaId, mode) : undefined} preload="metadata">Your browser does not support embedded video.</video>}{block.caption ? <figcaption>{block.caption}</figcaption> : null}</figure>;
}

function renderLegacy(courseId: string, blocks: CourseMarkdownBlock[], quizzes: Map<string, QuizSummary>, quizProgress: CourseQuizProgress[], activities: CourseActivity[], activityProgress: CourseActivityProgress[], mode: "learner" | "admin", prefix: string): ReactNode[] {
  return blocks.map((block, index) => {
    const key = `${prefix}-${index}`;
    if (block.type === "heading") {
      const Heading = block.level <= 1 ? "h2" : block.level === 2 ? "h3" : "h4";
      return <Heading key={key}>{renderInline(block.text)}</Heading>;
    }
    if (block.type === "list") return <ul key={key}>{block.items.map((item, itemIndex) => <li key={`${key}-${itemIndex}`}>{renderInline(item)}</li>)}</ul>;
    if (block.type === "media") return block.mediaId ? renderMedia(courseId, {id: key, type: "media", mediaId: block.mediaId, kind: block.kind, alt: "Course attachment", width: "content", align: "center"}, mode, key) : null;
    if (block.type === "quiz") return renderQuiz(courseId, block, quizzes, quizProgress, key);
    if (block.type === "activity") {
      const activity = activities.find(item => item.id === block.activityId);
      return activity ? <CourseActivityCard key={key} courseId={courseId} activity={{...activity, required: block.required, passPercentage: block.passPercentage ?? activity.passPercentage}} progress={activityProgress.find(item => item.activityId === block.activityId)} mode={mode}/> : <aside className={styles.activityCard} key={key}><p className={styles.activityEyebrow}>{block.required ? "Required activity" : "Activity"}</p><h3>Course activity</h3><p>Complete the linked activity before continuing.</p></aside>;
    }
    if (block.type === "diagram") return <CourseDiagram key={key} block={{id: key, type: "diagram", diagramId: block.diagramId}}/>;
    return <p key={key}>{block.lines.map((line, lineIndex) => <span key={`${key}-${lineIndex}`}>{lineIndex > 0 ? <br/> : null}{renderInline(line)}</span>)}</p>;
  });
}

export default function CourseMarkdown({courseId, blocks = [], document, quizzes, quizProgress, activities = [], activityProgress = [], mode = "learner"}: CourseMarkdownProps) {
  const parsedDocument = parseCourseDocument(document);
  const activityMap = new Map(activities.map(activity => [activity.id, activity]));
  const progressMap = new Map(activityProgress.map(progress => [progress.activityId, progress]));
  const rendered = parsedDocument?.blocks.flatMap((block, index): ReactNode[] => {
    const key = `document-${index}-${block.id}`;
      if (block.type === "text") return renderLegacy(courseId, parseCourseMarkdownSafe(block.markdown), quizzes, quizProgress, activities, activityProgress, mode, key);
    if (block.type === "media") return block.mediaId ? [renderMedia(courseId, block, mode, key)] : [];
    if (block.type === "quiz") return [renderQuiz(courseId, block, quizzes, quizProgress, key)];
    if (block.type === "activity") {
      const activity = activityMap.get(block.activityId);
      return [activity ? <CourseActivityCard key={key} courseId={courseId} activity={{...activity, required: block.required, passPercentage: block.passPercent ?? activity.passPercentage}} progress={progressMap.get(block.activityId)} mode={mode}/> : <aside className={styles.activityCard} key={key}><p className={styles.activityEyebrow}>Required activity</p><h3>Activity unavailable</h3><p>The linked activity is not available yet.</p></aside>];
    }
    if (block.type === "diagram") return [<CourseDiagram key={key} block={block}/>];
    return [<aside className={`${styles.callout} ${styles[`callout${block.tone[0].toUpperCase()}${block.tone.slice(1)}`] ?? ""}`} key={key}><p className={styles.calloutLabel}>{block.tone}</p><h3>{block.title}</h3><div>{renderLegacy(courseId, parseCourseMarkdownSafe(block.markdown), quizzes, quizProgress, activities, activityProgress, mode, key)}</div></aside>];
  }) ?? renderLegacy(courseId, blocks, quizzes, quizProgress, activities, activityProgress, mode, "legacy");
  return <div className={styles.markdown}>{rendered}</div>;
}

function parseCourseMarkdownSafe(markdown: string): CourseMarkdownBlock[] {
  try {
    // The parser is deliberately the small safe Markdown dialect already used by courses.
    // It never evaluates HTML or arbitrary component markup.
    return parseCourseMarkdown(markdown);
  } catch {
    return [{type: "paragraph", lines: [markdown]}];
  }
}
