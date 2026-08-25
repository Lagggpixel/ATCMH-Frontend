import type {ReactNode} from "react";
import type {ExamQuizSummary} from "../../types/Exam.ts";
import type {ManagedCourse} from "../../types/Course.ts";
import {parseCourseMarkdown, type CourseMarkdownBlock} from "@/src/lib/course-markdown";
import {ApiUtils} from "@/src/dashboard/utils/ApiUtils";
import styles from "./CourseCenter.module.css";

function safeHref(value: string) {
    return /^https?:\/\//i.test(value) || value.startsWith("/") ? value : undefined;
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

function mediaSource(courseId: string, mediaId: string) {
    return `${ApiUtils.apiOrigin}/admin/courses/${encodeURIComponent(courseId)}/media/${encodeURIComponent(mediaId)}`;
}

function PreviewMarkdown({courseId, blocks, quizzes}: {courseId: string; blocks: CourseMarkdownBlock[]; quizzes: Map<string, ExamQuizSummary>}) {
    return <div className={styles.previewMarkdown}>
        {blocks.map((block, index) => {
            if (block.type === "heading") {
                const Heading = block.level <= 2 ? "h4" : "h5";
                return <Heading key={index}>{renderInline(block.text)}</Heading>;
            }
            if (block.type === "list") return <ul key={index}>{block.items.map((item, itemIndex) => <li key={`${item}-${itemIndex}`}>{renderInline(item)}</li>)}</ul>;
            if (block.type === "media") {
                const src = mediaSource(courseId, block.mediaId);
                if (block.kind === "image") {
                    // eslint-disable-next-line @next/next/no-img-element
                    return <figure className={styles.previewMedia} key={index}><img src={src} alt="Course attachment" loading="lazy"/></figure>;
                }
                return <figure className={styles.previewMedia} key={index}><video src={src} controls preload="metadata">Your browser does not support embedded video.</video></figure>;
            }
            if (block.type === "quiz") {
                const quiz = quizzes.get(block.quizId);
                return <aside className={styles.previewQuiz} key={index} aria-label={block.required ? "Required quiz checkpoint" : "Course quiz"}>
                    <div>
                        <p className={styles.previewQuizEyebrow}>{block.required ? block.passPercentage === undefined ? "Required checkpoint" : `Required · pass ${block.passPercentage}%` : "Knowledge check"}</p>
                        <h4>{quiz?.title ?? "Linked quiz unavailable"}</h4>
                        <p>{quiz?.description || "Take this quiz to check understanding."}</p>
                    </div>
                    {quiz ? <a className={styles.previewQuizAction} href={`/exams/quizzes/${encodeURIComponent(quiz.id)}`} target="_blank" rel="noreferrer">Open quiz</a> : <span className={styles.previewUnavailable}>Unavailable</span>}
                </aside>;
            }
            return <p key={index}>{block.lines.map((line, lineIndex) => <span key={`${line}-${lineIndex}`}>{lineIndex > 0 ? <br/> : null}{renderInline(line)}</span>)}</p>;
        })}
    </div>;
}

interface CoursePreviewProps {
    course: ManagedCourse;
    quizzes: ExamQuizSummary[];
    onEdit: () => void;
}

export default function CoursePreview({course, quizzes, onEdit}: CoursePreviewProps) {
    const quizMap = new Map(quizzes.map((quiz) => [quiz.id, quiz]));

    return <section className={styles.preview} aria-labelledby="course-preview-heading">
        <div className={styles.previewHeader}>
            <div>
                <p className={styles.eyebrow}>Moderator preview</p>
                <h2 id="course-preview-heading">{course.title}</h2>
                <p>{course.description || "No course description."}</p>
            </div>
            <div className={styles.previewHeaderActions}>
                <span className={course.isPublished ? styles.published : styles.draft}>{course.isPublished ? "Published course" : "Private draft"}</span>
                <button type="button" className={styles.quietButton} onClick={onEdit}>Edit markdown</button>
            </div>
        </div>
        <p className={styles.previewNotice}>This is a staff preview. It does not start enrollment, record course progress, or complete sections. Quiz links open separately in the Exams Center.</p>
        <div className={styles.previewSections}>
            {course.sections.map((section, index) => <article className={styles.previewSection} key={section.id ?? `${section.sortOrder}-${index}`}>
                <header className={styles.previewSectionHeader}><span>Section {index + 1}</span><h3>{section.title}</h3></header>
                <PreviewMarkdown courseId={course.id} blocks={parseCourseMarkdown(section.markdown)} quizzes={quizMap}/>
            </article>)}
        </div>
    </section>;
}
