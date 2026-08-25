import Link from "next/link";
import type { QuizSummary } from "@/src/lib/exams-repository";
import type { CourseMarkdownBlock } from "@/src/lib/course-markdown";
import type { CourseQuizProgress } from "@/src/dashboard/types/Course";
import { ApiUtils } from "@/src/dashboard/utils/ApiUtils";
import styles from "./CourseReader.module.css";

function safeHref(value: string) {
  return /^https?:\/\//i.test(value) || value.startsWith("/") ? value : undefined;
}

function renderInline(text: string) {
  const tokens = /(\*\*[^*]+\*\*|`[^`]+`|\[([^\]]+)\]\(([^)]+)\))/g;
  const children: React.ReactNode[] = [];
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
  blocks: CourseMarkdownBlock[];
  quizzes: Map<string, QuizSummary>;
  quizProgress: CourseQuizProgress[];
}

export default function CourseMarkdown({ courseId, blocks, quizzes, quizProgress }: CourseMarkdownProps) {
  return <div className={styles.markdown}>
    {blocks.map((block, index) => {
      if (block.type === "heading") {
        const Heading = block.level <= 1 ? "h2" : block.level === 2 ? "h3" : "h4";
        return <Heading key={index}>{renderInline(block.text)}</Heading>;
      }
      if (block.type === "list") return <ul key={index}>{block.items.map((item) => <li key={item}>{renderInline(item)}</li>)}</ul>;
      if (block.type === "media") {
        const src = `${ApiUtils.apiOrigin}/courses/media/${encodeURIComponent(block.mediaId)}`;
        if (block.kind === "image") {
          // eslint-disable-next-line @next/next/no-img-element
          const image = <img src={src} alt="Course attachment" loading="lazy"/>;
          return <figure className={styles.media} key={index}>{image}</figure>;
        }
        return <figure className={styles.media} key={index}><video src={src} controls preload="metadata">Your browser does not support embedded video.</video></figure>;
      }
      if (block.type === "quiz") {
        const quiz = quizzes.get(block.quizId);
        const progress = quizProgress.find((item) => item.quizId === block.quizId);
        const taken = Boolean(progress && progress.attemptCount > 0);
        const passed = taken && (block.passPercentage === undefined || (progress?.bestPercentage ?? 0) >= block.passPercentage);
        return <aside className={styles.quizCard} key={index} aria-label={block.required ? "Required quiz" : "Course quiz"}>
          <div>
            <p className={styles.quizEyebrow}>{block.required ? block.passPercentage === undefined ? "Required checkpoint" : `Required · pass ${block.passPercentage}%` : "Knowledge check"}</p>
            <h3>{quiz?.title ?? "Linked quiz unavailable"}</h3>
            <p>{quiz?.description || "Take this quiz to check your understanding of the section."}</p>
            {taken ? <span className={passed ? styles.quizComplete : styles.quizIncomplete}>{block.passPercentage === undefined ? "Attempt recorded" : passed ? `Passed · best score ${progress?.bestPercentage ?? 0}%` : `Best score ${progress?.bestPercentage ?? 0}% · need ${block.passPercentage}%`}</span> : null}
          </div>
          {quiz ? <Link className={styles.quizAction} href={`/exams/quizzes/${quiz.id}?courseId=${encodeURIComponent(courseId)}`}>{passed ? "Review quiz" : taken ? "Retake quiz" : "Take quiz"}</Link> : null}
        </aside>;
      }
      return <p key={index}>{block.lines.map((line, lineIndex) => <span key={`${line}-${lineIndex}`}>{lineIndex > 0 ? <br/> : null}{renderInline(line)}</span>)}</p>;
    })}
  </div>;
}
