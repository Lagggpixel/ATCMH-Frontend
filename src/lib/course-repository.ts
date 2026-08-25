import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";

import { queryReadOnly, withWriteTransaction } from "./db";
import { courseMarkdownReferences, parseCourseMarkdown, type CourseMarkdownReference } from "./course-markdown";
import { getQuizSummariesByIds, type QuizSummary } from "./exams-repository";

export interface CourseSummary {
  id: string;
  slug: string;
  title: string;
  description: string;
  isPublished: boolean;
  updatedAt: string;
  sectionCount: number;
}

export interface CourseSection {
  id: string;
  courseId: string;
  title: string;
  sortOrder: number;
  markdown: string;
  updatedAt: string;
}

export interface Course extends CourseSummary {
  sections: CourseSection[];
}

export interface LearnerCourse extends Course {
  completedSectionIds: string[];
  takenQuizIds: string[];
  quizProgress: CourseQuizProgress[];
  enrollment: CourseEnrollment | null;
}

export type CourseEnrollmentStatus = "in_progress" | "completed";

export interface CourseEnrollment {
  courseId: string;
  userId: string;
  status: CourseEnrollmentStatus;
  startedAt: string;
  lastAccessedAt: string;
  completedAt: string | null;
  lastSectionId: string | null;
}

export interface CourseQuizProgress {
  quizId: string;
  attemptCount: number;
  bestPercentage: number;
  lastAttemptAt: string | null;
}

export interface CourseLearnerStatistics {
  userId: string;
  status: CourseEnrollmentStatus;
  startedAt: string;
  lastAccessedAt: string;
  completedAt: string | null;
  completedSectionCount: number;
}

export interface CourseSectionStatistics {
  sectionId: string;
  title: string;
  sortOrder: number;
  completedCount: number;
  completionRate: number;
}

export interface CourseQuizStatistics {
  quizId: string;
  title: string;
  required: boolean;
  passPercentage: number | null;
  attemptCount: number;
  attemptedLearnerCount: number;
  qualifiedLearnerCount: number;
  qualificationRate: number;
}

export interface CourseStatistics {
  courseId: string;
  totalLearnersStarted: number;
  learnersInProgress: number;
  learnersCompleted: number;
  completionRate: number;
  activeLearners30d: number;
  averageCompletionDays: number | null;
  learners: CourseLearnerStatistics[];
  sections: CourseSectionStatistics[];
  quizzes: CourseQuizStatistics[];
}

export interface CourseMedia {
  id: string;
  courseId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  content: Buffer;
}

type CourseRow = RowDataPacket & {
  id: string;
  slug: string;
  title: string;
  description: string;
  is_published: number | boolean;
  updated_at: string;
  section_count?: number;
};

type SectionRow = RowDataPacket & {
  id: string;
  course_id: string;
  title: string;
  sort_order: number;
  markdown_content: string;
  updated_at: string;
};

type EnrollmentRow = RowDataPacket & {
  course_id: string;
  user_id: string;
  status: CourseEnrollmentStatus;
  started_at: string;
  last_accessed_at: string;
  completed_at: string | null;
  last_section_id: string | null;
  completed_section_count?: number;
};

type QuizProgressRow = RowDataPacket & {
  quiz_id: string;
  attempt_count: number;
  best_percentage: number;
  last_attempt_at: string | null;
};

type CourseAttemptRow = RowDataPacket & {
  quiz_id: string;
  user_id: string;
  percentage: number;
};

const discordSnowflake = /^\d{15,20}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isCourseId = (value: string) => uuid.test(value);

function toSummary(row: CourseRow): CourseSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    isPublished: Boolean(row.is_published),
    updatedAt: row.updated_at,
    sectionCount: Number(row.section_count ?? 0),
  };
}

function toSection(row: SectionRow): CourseSection {
  return {
    id: row.id,
    courseId: row.course_id,
    title: row.title,
    sortOrder: row.sort_order,
    markdown: row.markdown_content,
    updatedAt: row.updated_at,
  };
}

function toEnrollment(row: EnrollmentRow): CourseEnrollment {
  return {
    courseId: row.course_id,
    userId: row.user_id,
    status: row.status,
    startedAt: row.started_at,
    lastAccessedAt: row.last_accessed_at,
    completedAt: row.completed_at,
    lastSectionId: row.last_section_id,
  };
}

async function sectionsFor(courseId: string): Promise<CourseSection[]> {
  const rows = await queryReadOnly<SectionRow[]>(
    "SELECT id, course_id, title, sort_order, markdown_content, updated_at FROM course_sections WHERE course_id = ? ORDER BY sort_order ASC, id ASC",
    [courseId],
  );
  return rows.map(toSection);
}

async function enrollmentFor(courseId: string, discordId: string): Promise<CourseEnrollment | null> {
  const [row] = await queryReadOnly<EnrollmentRow[]>(
    `SELECT course_id, user_id, status, started_at, last_accessed_at, completed_at, last_section_id
       FROM course_enrollments
      WHERE course_id = ? AND user_id = ?
      LIMIT 1`,
    [courseId, discordId],
  );
  return row ? toEnrollment(row) : null;
}

export async function listManagedCourses(): Promise<CourseSummary[]> {
  const rows = await queryReadOnly<CourseRow[]>(
    `SELECT c.id, c.slug, c.title, c.description, c.is_published, c.updated_at,
            COUNT(s.id) AS section_count
       FROM courses c
       LEFT JOIN course_sections s ON s.course_id = c.id
      GROUP BY c.id, c.slug, c.title, c.description, c.is_published, c.updated_at
      ORDER BY c.updated_at DESC, c.title ASC`,
  );
  return rows.map(toSummary);
}

export async function getManagedCourse(id: string): Promise<Course | null> {
  if (!isCourseId(id)) throw new Error("Course IDs must be UUIDs");
  const [row] = await queryReadOnly<CourseRow[]>(
    `SELECT c.id, c.slug, c.title, c.description, c.is_published, c.updated_at,
            COUNT(s.id) AS section_count
       FROM courses c
       LEFT JOIN course_sections s ON s.course_id = c.id
      WHERE c.id = ?
      GROUP BY c.id, c.slug, c.title, c.description, c.is_published, c.updated_at
      LIMIT 1`,
    [id],
  );
  if (!row) return null;
  return { ...toSummary(row), sections: await sectionsFor(id) };
}

export async function listPublishedCourses(discordId: string): Promise<CourseSummary[]> {
  if (!discordSnowflake.test(discordId)) throw new Error("Discord IDs must be valid snowflakes");
  const rows = await queryReadOnly<CourseRow[]>(
    `SELECT c.id, c.slug, c.title, c.description, c.is_published, c.updated_at,
            COUNT(s.id) AS section_count
       FROM courses c
       LEFT JOIN course_sections s ON s.course_id = c.id
      WHERE c.is_published = TRUE
      GROUP BY c.id, c.slug, c.title, c.description, c.is_published, c.updated_at
      ORDER BY c.title ASC, c.id ASC`,
  );
  return rows.map(toSummary);
}

function quizReferences(sections: readonly CourseSection[]): CourseMarkdownReference[] {
  return sections.flatMap((section) => courseMarkdownReferences(section.markdown));
}

async function quizProgressFor(discordId: string, quizIds: readonly string[]): Promise<CourseQuizProgress[]> {
  if (quizIds.length === 0) return [];
  const placeholders = quizIds.map(() => "?").join(", ");
  const rows = await queryReadOnly<QuizProgressRow[]>(
    `SELECT quiz_id, COUNT(*) AS attempt_count, MAX(percentage) AS best_percentage, MAX(submitted_at) AS last_attempt_at
       FROM attempts
      WHERE student_name IN (?, ?) AND quiz_id IN (${placeholders})
      GROUP BY quiz_id`,
    [`<@${discordId}>`, `<@!${discordId}>`, ...quizIds],
  );
  return rows.map((row) => ({
    quizId: row.quiz_id,
    attemptCount: Number(row.attempt_count),
    bestPercentage: Number(row.best_percentage),
    lastAttemptAt: row.last_attempt_at,
  }));
}

function quizProgressForId(progress: readonly CourseQuizProgress[], quizId: string) {
  return progress.find((item) => item.quizId === quizId);
}

export function courseQuizRequirementSatisfied(
  reference: Extract<CourseMarkdownReference, { type: "quiz" }>,
  progress: readonly CourseQuizProgress[],
) {
  if (!reference.required) return true;
  const result = quizProgressForId(progress, reference.quizId);
  return Boolean(result && result.attemptCount > 0 && (reference.passPercentage === undefined || result.bestPercentage >= reference.passPercentage));
}

export async function getCourseForLearner(id: string, discordId: string): Promise<LearnerCourse | null> {
  if (!isCourseId(id)) throw new Error("Course IDs must be UUIDs");
  if (!discordSnowflake.test(discordId)) throw new Error("Discord IDs must be valid snowflakes");
  const [row] = await queryReadOnly<CourseRow[]>(
    `SELECT c.id, c.slug, c.title, c.description, c.is_published, c.updated_at,
            COUNT(s.id) AS section_count
       FROM courses c
       LEFT JOIN course_sections s ON s.course_id = c.id
      WHERE c.id = ? AND c.is_published = TRUE
      GROUP BY c.id, c.slug, c.title, c.description, c.is_published, c.updated_at
      LIMIT 1`,
    [id],
  );
  if (!row) return null;

  const sections = await sectionsFor(id);
  const quizIds = [...new Set(quizReferences(sections).filter((reference): reference is Extract<CourseMarkdownReference, { type: "quiz" }> => reference.type === "quiz").map((reference) => reference.quizId))];
  const [progressRows, quizProgress, enrollment] = await Promise.all([
    queryReadOnly<Array<RowDataPacket & { section_id: string }>>(
      "SELECT section_id FROM course_progress WHERE course_id = ? AND user_id = ?",
      [id, discordId],
    ),
    quizProgressFor(discordId, quizIds),
    enrollmentFor(id, discordId),
  ]);
  return {
    ...toSummary(row),
    sections,
    completedSectionIds: progressRows.map((progress) => progress.section_id),
    takenQuizIds: quizProgress.filter((progress) => progress.attemptCount > 0).map((progress) => progress.quizId),
    quizProgress,
    enrollment,
  };
}

type CourseWriteConnection = Pick<PoolConnection, "execute">;

async function recordCourseActivity(
  connection: CourseWriteConnection,
  courseId: string,
  discordId: string,
  eventType: "course_started" | "section_completed" | "course_completed",
  sectionId: string | null,
  eventAt: string,
) {
  await connection.execute(
    `INSERT INTO course_activity_events (id, course_id, section_id, user_id, event_type, event_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [randomUUID(), courseId, sectionId, discordId, eventType, eventAt],
  );
}

export async function recordCourseAccess(courseId: string, discordId: string): Promise<CourseEnrollment | null> {
  if (!isCourseId(courseId)) throw new Error("Course IDs must be UUIDs");
  if (!discordSnowflake.test(discordId)) throw new Error("Discord IDs must be valid snowflakes");
  const now = new Date().toISOString();

  return withWriteTransaction(async (connection) => {
    const [courseRows] = await connection.execute(
      "SELECT id FROM courses WHERE id = ? AND is_published = TRUE FOR UPDATE",
      [courseId],
    ) as unknown as [Array<{ id: string }>];
    if (courseRows.length === 0) return null;

    const [enrollmentRows] = await connection.execute(
      `SELECT course_id, user_id, status, started_at, last_accessed_at, completed_at, last_section_id
         FROM course_enrollments
        WHERE course_id = ? AND user_id = ?
        FOR UPDATE`,
      [courseId, discordId],
    ) as unknown as [EnrollmentRow[]];
    if (enrollmentRows.length === 0) {
      await connection.execute(
        `INSERT INTO course_enrollments
          (course_id, user_id, status, started_at, last_accessed_at, completed_at, last_section_id)
         VALUES (?, ?, 'in_progress', ?, ?, NULL, NULL)`,
        [courseId, discordId, now, now],
      );
      await recordCourseActivity(connection, courseId, discordId, "course_started", null, now);
      return {
        courseId,
        userId: discordId,
        status: "in_progress",
        startedAt: now,
        lastAccessedAt: now,
        completedAt: null,
        lastSectionId: null,
      } satisfies CourseEnrollment;
    }

    await connection.execute(
      "UPDATE course_enrollments SET last_accessed_at = ? WHERE course_id = ? AND user_id = ?",
      [now, courseId, discordId],
    );
    return toEnrollment({ ...enrollmentRows[0], last_accessed_at: now });
  });
}

export async function completeCourseSection(courseId: string, sectionId: string, discordId: string) {
  if (!isCourseId(courseId) || !isCourseId(sectionId)) throw new Error("Course and section IDs must be UUIDs");
  const course = await getCourseForLearner(courseId, discordId);
  if (!course) throw new Error("Course not found");
  const index = course.sections.findIndex((section) => section.id === sectionId);
  if (index < 0) throw new Error("Course section not found");

  const previous = course.sections.slice(0, index);
  if (previous.some((section) => !course.completedSectionIds.includes(section.id))) {
    throw new CourseProgressError("Complete the previous course section first.");
  }

  const requiredQuizReferences = courseMarkdownReferences(course.sections[index].markdown)
    .filter((reference): reference is Extract<CourseMarkdownReference, { type: "quiz" }> => reference.type === "quiz" && reference.required);
  const missingQuiz = requiredQuizReferences.find((reference) => !courseQuizRequirementSatisfied(reference, course.quizProgress));
  if (missingQuiz) {
    throw new CourseProgressError(
      missingQuiz.passPercentage === undefined
        ? "Take the required quiz before completing this section."
        : `Reach at least ${missingQuiz.passPercentage}% on the required quiz before completing this section.`,
    );
  }

  const now = new Date().toISOString();
  const courseWillBeComplete = course.sections.every((section, sectionIndex) => sectionIndex === index || course.completedSectionIds.includes(section.id));
  await withWriteTransaction(async (connection) => {
    const [existingProgress] = await connection.execute(
      "SELECT section_id FROM course_progress WHERE course_id = ? AND section_id = ? AND user_id = ? FOR UPDATE",
      [courseId, sectionId, discordId],
    ) as unknown as [Array<{ section_id: string }>];
    const wasAlreadyCompleted = existingProgress.length > 0;
    if (!wasAlreadyCompleted) {
      await connection.execute(
        `INSERT INTO course_progress (course_id, section_id, user_id, completed_at)
         VALUES (?, ?, ?, ?)`,
        [courseId, sectionId, discordId, now],
      );
    }

    const [enrollmentRows] = await connection.execute(
      `SELECT course_id, user_id, status, started_at, last_accessed_at, completed_at, last_section_id
         FROM course_enrollments
        WHERE course_id = ? AND user_id = ?
        FOR UPDATE`,
      [courseId, discordId],
    ) as unknown as [EnrollmentRow[]];
    const existingEnrollment = enrollmentRows[0];
    if (!existingEnrollment) {
      await connection.execute(
        `INSERT INTO course_enrollments
          (course_id, user_id, status, started_at, last_accessed_at, completed_at, last_section_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [courseId, discordId, courseWillBeComplete ? "completed" : "in_progress", now, now, courseWillBeComplete ? now : null, sectionId],
      );
      await recordCourseActivity(connection, courseId, discordId, "course_started", null, now);
    } else {
      await connection.execute(
        `UPDATE course_enrollments
            SET status = CASE WHEN status = 'completed' OR ? = 'completed' THEN 'completed' ELSE 'in_progress' END,
                last_accessed_at = ?,
                completed_at = COALESCE(completed_at, ?),
                last_section_id = ?
          WHERE course_id = ? AND user_id = ?`,
        [courseWillBeComplete ? "completed" : "in_progress", now, courseWillBeComplete ? now : null, sectionId, courseId, discordId],
      );
    }

    if (!wasAlreadyCompleted) {
      await recordCourseActivity(connection, courseId, discordId, "section_completed", sectionId, now);
    }
    if (courseWillBeComplete && existingEnrollment?.status !== "completed") {
      await recordCourseActivity(connection, courseId, discordId, "course_completed", sectionId, now);
    }
  });
  return { courseId, sectionId, completed: true, courseCompleted: courseWillBeComplete };
}

export class CourseProgressError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CourseProgressError";
  }
}

function percentage(value: number, total: number) {
  return total === 0 ? 0 : Math.round((value / total) * 1000) / 10;
}

export async function getCourseStatistics(courseId: string): Promise<CourseStatistics | null> {
  if (!isCourseId(courseId)) throw new Error("Course IDs must be UUIDs");
  const course = await getManagedCourse(courseId);
  if (!course) return null;

  const references = quizReferences(course.sections).filter(
    (reference): reference is Extract<CourseMarkdownReference, { type: "quiz" }> => reference.type === "quiz",
  );
  const quizIds = [...new Set(references.map((reference) => reference.quizId))];
  const [enrollmentRows, sectionRows, attemptRows, quizSummaries] = await Promise.all([
    queryReadOnly<EnrollmentRow[]>(
      `SELECT e.course_id, e.user_id, e.status, e.started_at, e.last_accessed_at, e.completed_at, e.last_section_id,
              COUNT(p.section_id) AS completed_section_count
         FROM course_enrollments e
         LEFT JOIN course_progress p ON p.course_id = e.course_id AND p.user_id = e.user_id
        WHERE e.course_id = ?
        GROUP BY e.course_id, e.user_id, e.status, e.started_at, e.last_accessed_at, e.completed_at, e.last_section_id
        ORDER BY e.status ASC, e.started_at DESC, e.user_id ASC`,
      [courseId],
    ),
    queryReadOnly<Array<RowDataPacket & { section_id: string; title: string; sort_order: number; completed_count: number }>>(
      `SELECT s.id AS section_id, s.title, s.sort_order, COUNT(DISTINCT p.user_id) AS completed_count
         FROM course_sections s
         LEFT JOIN course_progress p ON p.course_id = s.course_id AND p.section_id = s.id
        WHERE s.course_id = ?
        GROUP BY s.id, s.title, s.sort_order
        ORDER BY s.sort_order ASC, s.id ASC`,
      [courseId],
    ),
    quizIds.length === 0
      ? Promise.resolve([] as CourseAttemptRow[])
      : queryReadOnly<CourseAttemptRow[]>(
        `SELECT quiz_id, user_id, percentage
           FROM course_quiz_attempts
          WHERE course_id = ? AND quiz_id IN (${quizIds.map(() => "?").join(", ")})`,
        [courseId, ...quizIds],
      ),
    getQuizSummariesByIds(quizIds),
  ]);

  const learners = enrollmentRows.map((row) => ({
    userId: row.user_id,
    status: row.status,
    startedAt: row.started_at,
    lastAccessedAt: row.last_accessed_at,
    completedAt: row.completed_at,
    completedSectionCount: Number(row.completed_section_count ?? 0),
  } satisfies CourseLearnerStatistics));
  const totalLearnersStarted = learners.length;
  const learnersCompleted = learners.filter((learner) => learner.status === "completed").length;
  const now = Date.now();
  const activeLearners30d = learners.filter((learner) => {
    const lastAccessed = Date.parse(learner.lastAccessedAt);
    return Number.isFinite(lastAccessed) && lastAccessed >= now - 30 * 24 * 60 * 60 * 1000;
  }).length;
  const completionDurations = learners.flatMap((learner) => {
    if (!learner.completedAt) return [];
    const started = Date.parse(learner.startedAt);
    const completed = Date.parse(learner.completedAt);
    return Number.isFinite(started) && Number.isFinite(completed) && completed >= started
      ? [(completed - started) / (24 * 60 * 60 * 1000)]
      : [];
  });

  const requirementByQuiz = new Map<string, { required: boolean; passPercentage: number | null }>();
  for (const reference of references) {
    const existing = requirementByQuiz.get(reference.quizId);
    requirementByQuiz.set(reference.quizId, {
      required: Boolean(existing?.required || reference.required),
      passPercentage: existing?.passPercentage === null || existing?.passPercentage === undefined
        ? (reference.passPercentage ?? null)
        : reference.passPercentage === undefined ? existing.passPercentage : Math.max(existing.passPercentage, reference.passPercentage),
    });
  }

  const attemptsByQuiz = new Map<string, Map<string, { count: number; bestPercentage: number }>>();
  for (const attempt of attemptRows) {
    const byLearner = attemptsByQuiz.get(attempt.quiz_id) ?? new Map<string, { count: number; bestPercentage: number }>();
    const existing = byLearner.get(attempt.user_id);
    byLearner.set(attempt.user_id, {
      count: (existing?.count ?? 0) + 1,
      bestPercentage: Math.max(existing?.bestPercentage ?? 0, Number(attempt.percentage)),
    });
    attemptsByQuiz.set(attempt.quiz_id, byLearner);
  }
  const quizTitles = new Map(quizSummaries.map((quiz) => [quiz.id, quiz.title]));
  const quizzes = [...requirementByQuiz.entries()].map(([quizId, requirement]) => {
    const learnerAttempts = attemptsByQuiz.get(quizId) ?? new Map();
    const qualifiedLearnerCount = [...learnerAttempts.values()].filter((attempt) => requirement.passPercentage === null || attempt.bestPercentage >= requirement.passPercentage).length;
    return {
      quizId,
      title: quizTitles.get(quizId) ?? "Linked quiz unavailable",
      required: requirement.required,
      passPercentage: requirement.passPercentage,
      attemptCount: [...learnerAttempts.values()].reduce((total, attempt) => total + attempt.count, 0),
      attemptedLearnerCount: learnerAttempts.size,
      qualifiedLearnerCount,
      qualificationRate: percentage(qualifiedLearnerCount, totalLearnersStarted),
    } satisfies CourseQuizStatistics;
  });

  return {
    courseId,
    totalLearnersStarted,
    learnersInProgress: learners.filter((learner) => learner.status === "in_progress").length,
    learnersCompleted,
    completionRate: percentage(learnersCompleted, totalLearnersStarted),
    activeLearners30d,
    averageCompletionDays: completionDurations.length === 0
      ? null
      : Math.round((completionDurations.reduce((total, duration) => total + duration, 0) / completionDurations.length) * 10) / 10,
    learners,
    sections: sectionRows.map((row) => ({
      sectionId: row.section_id,
      title: row.title,
      sortOrder: Number(row.sort_order),
      completedCount: Number(row.completed_count),
      completionRate: percentage(Number(row.completed_count), totalLearnersStarted),
    })),
    quizzes,
  };
}

export async function getCourseMediaForLearner(mediaId: string, discordId: string): Promise<CourseMedia | null> {
  if (!isCourseId(mediaId)) throw new Error("Media IDs must be UUIDs");
  if (!discordSnowflake.test(discordId)) throw new Error("Discord IDs must be valid snowflakes");
  const [row] = await queryReadOnly<Array<RowDataPacket & CourseMedia & { is_published: number }>>(
    `SELECT m.id, m.course_id AS courseId, m.filename, m.content_type AS contentType,
            m.size_bytes AS sizeBytes, m.sha256, m.content, c.is_published
       FROM course_media m
       JOIN courses c ON c.id = m.course_id
      WHERE m.id = ? AND c.is_published = TRUE
      LIMIT 1`,
    [mediaId],
  );
  if (!row) return null;
  return {
    id: row.id,
    courseId: row.courseId,
    filename: row.filename,
    contentType: row.contentType,
    sizeBytes: Number(row.sizeBytes),
    sha256: row.sha256,
    content: row.content,
  };
}

/** Staff previews may load attachments from both drafts and published courses. */
export async function getCourseMediaForManager(courseId: string, mediaId: string): Promise<CourseMedia | null> {
  if (!isCourseId(courseId)) throw new Error("Course IDs must be UUIDs");
  if (!isCourseId(mediaId)) throw new Error("Media IDs must be UUIDs");
  const [row] = await queryReadOnly<Array<RowDataPacket & CourseMedia>>(
    `SELECT m.id, m.course_id AS courseId, m.filename, m.content_type AS contentType,
            m.size_bytes AS sizeBytes, m.sha256, m.content
       FROM course_media m
      WHERE m.id = ? AND m.course_id = ?
      LIMIT 1`,
    [mediaId, courseId],
  );
  if (!row) return null;
  return {
    id: row.id,
    courseId: row.courseId,
    filename: row.filename,
    contentType: row.contentType,
    sizeBytes: Number(row.sizeBytes),
    sha256: row.sha256,
    content: row.content,
  };
}

export async function linkedQuizSummaries(course: Course): Promise<Map<string, QuizSummary>> {
  const quizIds = [...new Set(quizReferences(course.sections).filter((reference): reference is Extract<CourseMarkdownReference, { type: "quiz" }> => reference.type === "quiz").map((reference) => reference.quizId))];
  return new Map((await getQuizSummariesByIds(quizIds)).map((quiz) => [quiz.id, quiz]));
}

export function sectionBlocks(section: CourseSection) {
  return parseCourseMarkdown(section.markdown);
}
