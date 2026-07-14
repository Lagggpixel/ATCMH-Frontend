import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2";

import { queryReadOnly, withWriteTransaction } from "./db";
import { getQuiz, listManagedQuizzes as listManagedQuizSummaries, type Quiz, type QuizSummary } from "./exams-repository";
import { quizImportSchema, type NormalizedImport } from "./import-schema";
import { assertAdministrator, assertManagementCapability, type ManagementActor } from "./permissions";

const discordSnowflake = /^\d{15,20}$/;

export interface ManagedQuizInput extends NormalizedImport {
  id?: string;
}

export interface QuizUnlockInput {
  quizId: string;
  discordId: string;
  userName?: string;
  unlocked: boolean;
}

export interface WebsiteContent {
  home: {
    id: number;
    title: string;
    intro: string;
    headerTitle: string;
    headerSubtitle: string;
  } | null;
  announcements: Array<{ id: number; content: string; sortOrder: number }>;
  pages: Array<{ id: string; slug: string; title: string; content: string; createdAt: string; updatedAt: string }>;
}

export interface WebsiteContentInput {
  home?: WebsiteContent["home"];
  announcements?: Array<{ id?: number; content: string; sortOrder: number }>;
  pages?: Array<{ id?: string; slug: string; title: string; content: string }>;
}

export interface ManagedCategory {
  id: string;
  name: string;
  parentId: string | null;
}

export interface CategoryInput {
  name: string;
  parentId?: string | null;
}

export function assertManagementWritesEnabled() {
  if (process.env.EXAMS_MANAGEMENT_WRITES_ENABLED !== "true") {
    throw new Error("Exam management writes are disabled");
  }
}

function parseManagedQuizInput(input: ManagedQuizInput): { id?: string; quiz: NormalizedImport } {
  const { id, ...candidate } = input;
  if (id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("Quiz IDs must be UUIDs");
  }
  return { id, quiz: quizImportSchema.parse(candidate) };
}

async function taxonomyIds(quiz: NormalizedImport) {
  const [category] = await queryReadOnly<Array<RowDataPacket & { id: string }>>(
    "SELECT id FROM categories WHERE name = ? LIMIT 1",
    [quiz.category],
  );
  if (!category) throw new Error("category does not exist");

  const tagIds = new Set<string>();
  for (const tagName of quiz.tags) {
    const [tag] = await queryReadOnly<Array<RowDataPacket & { id: string }>>(
      "SELECT id FROM tags WHERE name = ? LIMIT 1",
      [tagName],
    );
    if (!tag) throw new Error(`tag does not exist: ${tagName}`);
    tagIds.add(tag.id);
  }
  return { categoryId: category.id, tagIds: [...tagIds] };
}

/** Discord-authorized mentors and administrators can manage every quiz. */
export async function listManagedQuizzes(actor: ManagementActor): Promise<QuizSummary[]> {
  assertManagementCapability(actor, "manage-exams");
  return listManagedQuizSummaries();
}

export async function getManagedQuiz(id: string, actor: ManagementActor): Promise<Quiz | null> {
  assertManagementCapability(actor, "manage-exams");
  return getQuiz(id);
}

/**
 * Creates an inactive draft or updates an existing canonical quiz ID. Only the
 * submitted quiz's questions, options, and tags are replaced; bank draws and
 * every unrelated LMS row remain untouched.
 */
export async function saveManagedQuiz(input: ManagedQuizInput, actor: ManagementActor): Promise<Quiz> {
  assertManagementCapability(actor, "manage-exams");
  assertManagementWritesEnabled();
  const { id: suppliedId, quiz } = parseManagedQuizInput(input);
  const { categoryId, tagIds } = await taxonomyIds(quiz);
  const quizId = suppliedId ?? randomUUID();
  const now = new Date().toISOString();

  await withWriteTransaction(async (connection) => {
    if (suppliedId) {
      const [existing] = await connection.execute(
        "SELECT id FROM quizzes WHERE id = ? FOR UPDATE",
        [quizId],
      ) as unknown as [Array<{ id: string }>];
      if (existing.length === 0) throw new Error("Quiz not found");
      await connection.execute(
        `UPDATE quizzes SET title = ?, description = ?, category_id = ?, feedback_mode = ?, time_limit_seconds = ?,
         randomize_questions = ?, is_private = ?, updated_at = ? WHERE id = ?`,
        [quiz.title, quiz.description, categoryId, quiz.feedbackMode, quiz.timeLimitSeconds, quiz.randomizeQuestions, quiz.isPrivate, now, quizId],
      );
      await connection.execute(
        "DELETE qo FROM quiz_options qo JOIN quiz_questions qq ON qq.id = qo.question_id WHERE qq.quiz_id = ?",
        [quizId],
      );
      await connection.execute("DELETE FROM quiz_questions WHERE quiz_id = ?", [quizId]);
      await connection.execute("DELETE FROM quiz_tags WHERE quiz_id = ?", [quizId]);
    } else {
      await connection.execute(
        `INSERT INTO quizzes (id, title, description, category_id, feedback_mode, time_limit_seconds, created_at, updated_at, randomize_questions, is_private)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
        [quizId, quiz.title, quiz.description, categoryId, quiz.feedbackMode, quiz.timeLimitSeconds, now, now, quiz.randomizeQuestions],
      );
    }

    for (const [questionIndex, question] of quiz.questions.entries()) {
      const questionId = randomUUID();
      const optionIds = question.options.map(() => randomUUID());
      const correctOptionId = optionIds[question.options.findIndex((option) => option.isCorrect)];
      await connection.execute(
        `INSERT INTO quiz_questions (id, quiz_id, prompt, correct_option_id, sort_order, randomize_options)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [questionId, quizId, question.prompt, correctOptionId, questionIndex + 1, question.randomizeOptions],
      );
      for (const [optionIndex, option] of question.options.entries()) {
        await connection.execute(
          "INSERT INTO quiz_options (id, question_id, text, sort_order) VALUES (?, ?, ?, ?)",
          [optionIds[optionIndex], questionId, option.text, optionIndex + 1],
        );
      }
    }
    for (const tagId of tagIds) {
      await connection.execute("INSERT INTO quiz_tags (quiz_id, tag_id) VALUES (?, ?)", [quizId, tagId]);
    }
  });

  const saved = await getQuiz(quizId);
  if (!saved) throw new Error("Saved quiz could not be loaded");
  return saved;
}

/** Administrator-only category change that deliberately preserves quiz content. */
export async function moveManagedQuizCategory(quizId: string, categoryId: string, actor: ManagementActor): Promise<Quiz> {
  assertAdministrator(actor);
  assertManagementWritesEnabled();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(quizId)) {
    throw new Error("Quiz IDs must be UUIDs");
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(categoryId)) {
    throw new Error("Category IDs must be UUIDs");
  }
  const now = new Date().toISOString();
  await withWriteTransaction(async (connection) => {
    const [quizzes] = await connection.execute("SELECT id FROM quizzes WHERE id = ? FOR UPDATE", [quizId]) as unknown as [Array<{ id: string }>];
    if (quizzes.length === 0) throw new Error("Quiz not found");
    const [categories] = await connection.execute("SELECT id FROM categories WHERE id = ? FOR UPDATE", [categoryId]) as unknown as [Array<{ id: string }>];
    if (categories.length === 0) throw new Error("Category not found");
    await connection.execute("UPDATE quizzes SET category_id = ?, updated_at = ? WHERE id = ?", [categoryId, now, quizId]);
  });
  const quiz = await getQuiz(quizId);
  if (!quiz) throw new Error("Saved quiz could not be loaded");
  return quiz;
}

export async function setQuizUnlock(input: QuizUnlockInput, actor: ManagementActor) {
  assertManagementCapability(actor, "unlock-learners");
  assertManagementWritesEnabled();
  if (!discordSnowflake.test(input.discordId)) throw new Error("Discord IDs must be valid snowflakes");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.quizId)) {
    throw new Error("Quiz IDs must be UUIDs");
  }
  const unlockedBy = actor.discordId ?? actor.id;
  if (!unlockedBy) throw new Error("not permitted");

  await withWriteTransaction(async (connection) => {
    const [quiz] = await connection.execute("SELECT id FROM quizzes WHERE id = ? FOR UPDATE", [input.quizId]) as unknown as [Array<{ id: string }>];
    if (quiz.length === 0) throw new Error("Quiz not found");
    if (input.unlocked) {
      await connection.execute(
        `INSERT INTO quiz_unlocks (quiz_id, user_id, unlocked_by, unlocked_at, user_name)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE unlocked_by = VALUES(unlocked_by), unlocked_at = VALUES(unlocked_at), user_name = VALUES(user_name)`,
        [input.quizId, input.discordId, unlockedBy, new Date().toISOString(), input.userName?.trim() || null],
      );
    } else {
      await connection.execute("DELETE FROM quiz_unlocks WHERE quiz_id = ? AND user_id = ?", [input.quizId, input.discordId]);
    }
  });
}

export async function listQuizUnlocks(quizId: string, actor: ManagementActor) {
  assertManagementCapability(actor, "unlock-learners");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(quizId)) {
    throw new Error("Quiz IDs must be UUIDs");
  }
  return queryReadOnly<Array<RowDataPacket & { discord_id: string; user_name: string | null; unlocked_by: string; unlocked_at: string }>>(
    "SELECT user_id AS discord_id, user_name, unlocked_by, unlocked_at FROM quiz_unlocks WHERE quiz_id = ? ORDER BY unlocked_at DESC, user_id ASC",
    [quizId],
  ).then((rows) => rows.map((row) => ({
    discordId: row.discord_id,
    userName: row.user_name,
    unlockedBy: row.unlocked_by,
    unlockedAt: row.unlocked_at,
  })));
}

export async function listManagedCategories(actor: ManagementActor): Promise<ManagedCategory[]> {
  assertAdministrator(actor);
  const rows = await queryReadOnly<Array<RowDataPacket & { id: string; name: string; parent_id: string | null }>>(
    "SELECT id, name, parent_id FROM categories ORDER BY name ASC, id ASC",
  );
  return rows.map((row) => ({ id: row.id, name: row.name, parentId: row.parent_id }));
}

export async function createManagedCategory(input: CategoryInput, actor: ManagementActor): Promise<ManagedCategory> {
  assertAdministrator(actor);
  assertManagementWritesEnabled();
  const name = input.name?.trim();
  if (!name || name.length > 255) throw new Error("Invalid category");
  if (input.parentId !== undefined && input.parentId !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.parentId)) {
    throw new Error("Category parent IDs must be UUIDs");
  }
  const id = randomUUID();
  const parentId = input.parentId ?? null;
  await withWriteTransaction(async (connection) => {
    if (parentId) {
      const [parent] = await connection.execute("SELECT id FROM categories WHERE id = ? FOR UPDATE", [parentId]) as unknown as [Array<{ id: string }>];
      if (parent.length === 0) throw new Error("Parent category not found");
    }
    await connection.execute("INSERT INTO categories (id, name, parent_id) VALUES (?, ?, ?)", [id, name, parentId]);
  });
  return { id, name, parentId };
}

export async function listWebsiteContent(): Promise<WebsiteContent> {
  const [homeRows, announcementRows, pageRows] = await Promise.all([
    queryReadOnly<Array<RowDataPacket & { id: number; title: string; intro: string; header_title: string; header_subtitle: string }>>(
      "SELECT id, title, intro, header_title, header_subtitle FROM home_content ORDER BY id ASC LIMIT 1",
    ),
    queryReadOnly<Array<RowDataPacket & { id: number; content: string; sort_order: number }>>(
      "SELECT id, content, sort_order FROM home_announcements ORDER BY sort_order ASC, id ASC",
    ),
    queryReadOnly<Array<RowDataPacket & { id: string; slug: string; title: string; content: string; created_at: string; updated_at: string }>>(
      "SELECT id, slug, title, content, created_at, updated_at FROM pages ORDER BY slug ASC",
    ),
  ]);
  const home = homeRows[0];
  return {
    home: home ? { id: home.id, title: home.title, intro: home.intro, headerTitle: home.header_title, headerSubtitle: home.header_subtitle } : null,
    announcements: announcementRows.map((announcement) => ({ id: announcement.id, content: announcement.content, sortOrder: announcement.sort_order })),
    pages: pageRows.map((page) => ({ id: page.id, slug: page.slug, title: page.title, content: page.content, createdAt: page.created_at, updatedAt: page.updated_at })),
  };
}

function cleanWebsiteInput(input: WebsiteContentInput) {
  for (const announcement of input.announcements ?? []) {
    if (!announcement.content.trim() || !Number.isInteger(announcement.sortOrder)) throw new Error("Invalid announcement");
  }
  for (const page of input.pages ?? []) {
    if (!page.slug.trim() || !page.title.trim() || !page.content.trim()) throw new Error("Invalid page");
    if (page.slug.length > 200 || page.title.length > 255) throw new Error("Invalid page");
  }
  if (input.home && (!input.home.title.trim() || !input.home.headerTitle.trim() || !input.home.headerSubtitle.trim())) {
    throw new Error("Invalid home content");
  }
}

/**
 * Administrator-only structured website edits. Existing home_html/home_css and
 * omitted announcement/page rows are deliberately preserved.
 */
export async function saveWebsiteContent(input: WebsiteContentInput, actor: ManagementActor) {
  assertAdministrator(actor);
  assertManagementWritesEnabled();
  cleanWebsiteInput(input);
  const now = new Date().toISOString();
  await withWriteTransaction(async (connection) => {
    if (input.home) {
      const [result] = await connection.execute(
        `UPDATE home_content SET title = ?, intro = ?, header_title = ?, header_subtitle = ? WHERE id = ?`,
        [input.home.title.trim(), input.home.intro.trim(), input.home.headerTitle.trim(), input.home.headerSubtitle.trim(), input.home.id],
      ) as unknown as [{ affectedRows?: number }];
      if (!result.affectedRows) throw new Error("Home content not found");
    }
    for (const announcement of input.announcements ?? []) {
      if (announcement.id) {
        const [result] = await connection.execute(
          "UPDATE home_announcements SET content = ?, sort_order = ? WHERE id = ?",
          [announcement.content.trim(), announcement.sortOrder, announcement.id],
        ) as unknown as [{ affectedRows?: number }];
        if (!result.affectedRows) throw new Error("Announcement not found");
      } else {
        await connection.execute("INSERT INTO home_announcements (content, sort_order) VALUES (?, ?)", [announcement.content.trim(), announcement.sortOrder]);
      }
    }
    for (const page of input.pages ?? []) {
      const pageId = page.id ?? randomUUID();
      if (page.id) {
        const [result] = await connection.execute(
          "UPDATE pages SET slug = ?, title = ?, content = ?, updated_at = ? WHERE id = ?",
          [page.slug.trim(), page.title.trim(), page.content, now, pageId],
        ) as unknown as [{ affectedRows?: number }];
        if (!result.affectedRows) throw new Error("Page not found");
      } else {
        await connection.execute(
          "INSERT INTO pages (id, slug, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
          [pageId, page.slug.trim(), page.title.trim(), page.content, now, now],
        );
      }
    }
  });
  return listWebsiteContent();
}
