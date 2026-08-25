import { createHash, randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";

import { queryReadOnly, withWriteTransaction } from "./db";
import { courseMarkdownReferences, validateCourseMarkdown, type CourseMarkdownReference } from "./course-markdown";
import { getManagedCourse, isCourseId, listManagedCourses, type Course, type CourseSummary } from "./course-repository";
import { assertManagementCapability, type ManagementActor } from "./permissions";
import { assertManagementWritesEnabled } from "./management-service";

const courseSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const mediaTypes = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "video/mp4", "video/webm"]);

export interface ManagedCourseInput {
  id?: string;
  slug: string;
  title: string;
  description: string;
  isPublished: boolean;
  sections: Array<{ id?: string; title: string; markdown: string; sortOrder: number }>;
}

export interface CourseMediaUpload {
  id: string;
  courseId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  markdown: string;
}

const sectionSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(255),
  markdown: z.string().max(16_000_000),
  sortOrder: z.number().int().min(1).max(10_000),
});

const courseSchema = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().trim().min(1).max(200).regex(courseSlug, "Use lowercase letters, numbers, and hyphens"),
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().max(2_000),
  isPublished: z.boolean(),
  sections: z.array(sectionSchema).min(1).max(200),
});

function parseInput(input: unknown): ManagedCourseInput {
  return courseSchema.parse(input);
}

function assertSectionSetIsSafe(course: ManagedCourseInput) {
  const suppliedIds = course.sections.flatMap((section) => section.id ? [section.id] : []);
  if (new Set(suppliedIds).size !== suppliedIds.length) throw new Error("Course sections must have unique IDs");
  if (!course.id && suppliedIds.length > 0) throw new Error("New courses cannot supply section IDs");
  if (course.sections.some((section, index) => section.sortOrder !== index + 1)) {
    throw new Error("Course sections must use sequential sort orders starting at 1");
  }
}

function allReferences(input: ManagedCourseInput): CourseMarkdownReference[] {
  return input.sections.flatMap((section) => {
    validateCourseMarkdown(section.markdown);
    return courseMarkdownReferences(section.markdown);
  });
}

async function assertReferencedQuizzesExist(references: readonly CourseMarkdownReference[]) {
  const quizIds = [...new Set(references.filter((reference): reference is Extract<CourseMarkdownReference, { type: "quiz" }> => reference.type === "quiz").map((reference) => reference.quizId))];
  if (quizIds.length === 0) return;
  const placeholders = quizIds.map(() => "?").join(", ");
  const rows = await queryReadOnly<Array<RowDataPacket & { id: string }>>(`SELECT id FROM quizzes WHERE id IN (${placeholders})`, quizIds);
  const existing = new Set(rows.map((row) => row.id));
  const missing = quizIds.find((id) => !existing.has(id));
  if (missing) throw new Error(`Quiz not found: ${missing}`);
}

async function assertReferencedMediaBelongsToCourse(courseId: string | undefined, references: readonly CourseMarkdownReference[]) {
  const mediaIds = [...new Set(references.filter((reference): reference is Extract<CourseMarkdownReference, { type: "media" }> => reference.type === "media").map((reference) => reference.mediaId))];
  if (mediaIds.length === 0) return;
  if (!courseId) throw new Error("Save the course before referencing uploaded media");
  const placeholders = mediaIds.map(() => "?").join(", ");
  const rows = await queryReadOnly<Array<RowDataPacket & { id: string }>>(
    `SELECT id FROM course_media WHERE course_id = ? AND id IN (${placeholders})`,
    [courseId, ...mediaIds],
  );
  const existing = new Set(rows.map((row) => row.id));
  const missing = mediaIds.find((id) => !existing.has(id));
  if (missing) throw new Error(`Media attachment not found for this course: ${missing}`);
}

function startsWithBytes(bytes: Buffer, signature: readonly number[], offset = 0) {
  return signature.every((value, index) => bytes[offset + index] === value);
}

function mediaMatchesDeclaredType(contentType: string, bytes: Buffer) {
  switch (contentType) {
    case "image/jpeg":
      return startsWithBytes(bytes, [0xff, 0xd8, 0xff]);
    case "image/png":
      return startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/gif":
      return bytes.subarray(0, 6).toString("ascii") === "GIF87a" || bytes.subarray(0, 6).toString("ascii") === "GIF89a";
    case "image/webp":
      return bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
    case "video/mp4":
      return bytes.subarray(4, 8).toString("ascii") === "ftyp";
    case "video/webm":
      return startsWithBytes(bytes, [0x1a, 0x45, 0xdf, 0xa3]);
    default:
      return false;
  }
}

export async function listManagedCoursesForActor(actor: ManagementActor): Promise<CourseSummary[]> {
  assertManagementCapability(actor, "manage-courses");
  return listManagedCourses();
}

export async function getManagedCourseForActor(id: string, actor: ManagementActor): Promise<Course | null> {
  assertManagementCapability(actor, "manage-courses");
  return getManagedCourse(id);
}

export async function saveManagedCourse(input: unknown, actor: ManagementActor): Promise<Course> {
  assertManagementCapability(actor, "manage-courses");
  assertManagementWritesEnabled();
  const candidate = parseInput(input);
  assertSectionSetIsSafe(candidate);
  if (candidate.isPublished && !actor.canManageAll && !actor.capabilities?.includes("publish-exams")) {
    throw new Error("administrator access is required to publish courses");
  }
  const references = allReferences(candidate);
  await assertReferencedQuizzesExist(references);
  await assertReferencedMediaBelongsToCourse(candidate.id, references);

  const courseId = candidate.id ?? randomUUID();
  const sectionIds = candidate.sections.map((section) => section.id ?? randomUUID());
  const suppliedSectionIds = candidate.sections.flatMap((section) => section.id ? [section.id] : []);
  const quizLinks = candidate.sections.flatMap((section, sectionIndex) => courseMarkdownReferences(section.markdown)
    .filter((reference): reference is Extract<CourseMarkdownReference, { type: "quiz" }> => reference.type === "quiz")
    .map((reference, referenceIndex) => ({
      sectionId: sectionIds[sectionIndex],
      quizId: reference.quizId,
      referenceOrder: referenceIndex + 1,
      isRequired: reference.required,
      passPercentage: reference.passPercentage ?? null,
    })));
  const now = new Date().toISOString();
  await withWriteTransaction(async (connection) => {
    if (candidate.id) {
      const [existing] = await connection.execute("SELECT id FROM courses WHERE id = ? FOR UPDATE", [courseId]) as unknown as [Array<{ id: string }>];
      if (existing.length === 0) throw new Error("Course not found");
      if (suppliedSectionIds.length > 0) {
        const placeholders = suppliedSectionIds.map(() => "?").join(", ");
        const [existingSections] = await connection.execute(
          `SELECT id FROM course_sections WHERE course_id = ? AND id IN (${placeholders}) FOR UPDATE`,
          [courseId, ...suppliedSectionIds],
        ) as unknown as [Array<{ id: string }>];
        if (existingSections.length !== suppliedSectionIds.length) throw new Error("Course section not found");
      }
      await connection.execute(
        `UPDATE courses SET slug = ?, title = ?, description = ?, is_published = ?, updated_at = ? WHERE id = ?`,
        [candidate.slug, candidate.title, candidate.description, candidate.isPublished, now, courseId],
      );
      const keepPlaceholders = sectionIds.map(() => "?").join(", ");
      await connection.execute(
        `DELETE FROM course_sections WHERE course_id = ?${sectionIds.length ? ` AND id NOT IN (${keepPlaceholders})` : ""}`,
        [courseId, ...sectionIds],
      );
    } else {
      await connection.execute(
        `INSERT INTO courses (id, slug, title, description, is_published, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [courseId, candidate.slug, candidate.title, candidate.description, candidate.isPublished, now, now],
      );
    }

    for (const [index, section] of candidate.sections.entries()) {
      await connection.execute(
        `INSERT INTO course_sections (id, course_id, title, sort_order, markdown_content, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE title = VALUES(title), sort_order = VALUES(sort_order), markdown_content = VALUES(markdown_content), updated_at = VALUES(updated_at)`,
        [sectionIds[index], courseId, section.title, section.sortOrder, section.markdown, now, now],
      );
    }
    await connection.execute("DELETE FROM course_quiz_links WHERE course_id = ?", [courseId]);
    for (const link of quizLinks) {
      await connection.execute(
        `INSERT INTO course_quiz_links
          (course_id, section_id, quiz_id, reference_order, is_required, pass_percentage)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [courseId, link.sectionId, link.quizId, link.referenceOrder, link.isRequired, link.passPercentage],
      );
    }
  });

  const saved = await getManagedCourse(courseId);
  if (!saved) throw new Error("Saved course could not be loaded");
  return saved;
}

interface UploadableMedia {
  name: string;
  type: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export async function uploadCourseMedia(courseId: string, file: UploadableMedia, actor: ManagementActor): Promise<CourseMediaUpload> {
  assertManagementCapability(actor, "manage-courses");
  assertManagementWritesEnabled();
  if (!isCourseId(courseId)) throw new Error("Course IDs must be UUIDs");
  if (!mediaTypes.has(file.type)) throw new Error("Only JPEG, PNG, GIF, WebP, MP4, and WebM attachments are supported");
  if (!Number.isSafeInteger(file.size) || file.size < 0) throw new Error("Media attachment size is invalid");
  const maxBytes = Number(process.env.COURSE_MEDIA_MAX_BYTES ?? 50 * 1024 * 1024);
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || file.size > maxBytes) throw new Error("Media attachment is too large");

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length !== file.size || bytes.length > maxBytes) throw new Error("Media attachment is too large");
  if (!mediaMatchesDeclaredType(file.type, bytes)) throw new Error("Media attachment content does not match its declared type");
  const filename = file.name.replace(/[\\/\u0000-\u001f]/g, "_").trim().slice(0, 255) || "course-media";
  const id = randomUUID();
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const markdown = file.type.startsWith("image/") ? `{{image:${id}}}` : `{{video:${id}}}`;

  await withWriteTransaction(async (connection) => {
    const [courses] = await connection.execute("SELECT id FROM courses WHERE id = ? FOR UPDATE", [courseId]) as unknown as [Array<{ id: string }>];
    if (courses.length === 0) throw new Error("Course not found");
    await connection.execute(
      `INSERT INTO course_media (id, course_id, filename, content_type, size_bytes, sha256, content, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, courseId, filename, file.type, bytes.length, sha256, bytes, new Date().toISOString()],
    );
  });

  return { id, courseId, filename, contentType: file.type, sizeBytes: bytes.length, sha256, markdown };
}
