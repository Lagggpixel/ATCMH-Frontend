import type { ResultSetHeader, RowDataPacket } from "mysql2";

import type { AttemptReview } from "./attempt-result";
import { getAttemptReview } from "./attempt-result";
import { queryReadOnly, withWriteTransaction } from "./db";
import { getAttemptByReference, isQuizId, parseAttemptStudentDiscordId } from "./exams-repository";
import { assertManagementWritesEnabled } from "./management-service";

export interface ManagementAttemptSummary {
  id: string;
  code: string;
  quizId: string;
  quizTitle: string;
  studentName: string;
  studentDiscordId: string | null;
  score: number;
  total: number;
  percentage: number;
  submittedAt: string | null;
  status: "submitted" | "timed_out";
  submissionReason: "manual" | "timeout";
}

export interface ManagementAttemptDetail extends ManagementAttemptSummary {
  review: AttemptReview;
}

interface ManagementAttemptRow extends RowDataPacket {
  id: string;
  code: string;
  quiz_id: string;
  quiz_title: string;
  student_name: string;
  student_discord_id?: string | null;
  score: number;
  total: number;
  percentage: number;
  submitted_at: string | Date | null;
  timed_out: number | boolean;
  submission_reason: "manual" | "timeout" | null;
}

export interface ManagementAttemptPage {
  limit?: number;
  offset?: number;
}

export interface ManagementAttemptPageRequest {
  page?: number;
  pageSize?: number;
  query?: string;
}

export interface ManagementAttemptPageResult {
  attempts: ManagementAttemptSummary[];
  page: number;
  pageSize: number;
  total: number;
}

function normalizeAttemptRow(row: ManagementAttemptRow): ManagementAttemptSummary {
  const timedOut = row.submission_reason === "timeout" || Boolean(row.timed_out);
  const submittedAt = row.submitted_at instanceof Date ? row.submitted_at.toISOString() : row.submitted_at;
  return {
    id: row.id,
    code: row.code.toLowerCase(),
    quizId: row.quiz_id,
    quizTitle: row.quiz_title,
    studentName: row.student_name,
    studentDiscordId: parseAttemptStudentDiscordId(row.student_name, row.student_discord_id),
    score: row.score,
    total: row.total,
    percentage: row.percentage,
    submittedAt,
    status: timedOut ? "timed_out" : "submitted",
    submissionReason: timedOut ? "timeout" : "manual",
  };
}

function validatePage(page: ManagementAttemptPage) {
  const limit = page.limit ?? 50;
  const offset = page.offset ?? 0;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Attempt list limit must be between 1 and 100");
  if (!Number.isInteger(offset) || offset < 0) throw new Error("Attempt list offset must be non-negative");
  return { limit, offset };
}

const managementAttemptColumns = `attempts.id, attempts.code, attempts.quiz_id, quizzes.title AS quiz_title,
  attempts.student_name, attempts.student_discord_id, attempts.score, attempts.total, attempts.percentage, attempts.submitted_at,
  attempts.timed_out, attempts.submission_reason`;

function managementAttemptSearch(query: string | undefined) {
  const normalized = query?.trim() ?? "";
  if (!normalized) return { where: "", values: [] as unknown[] };
  return {
    where: " WHERE (LOWER(attempts.student_name) LIKE LOWER(?) OR LOWER(attempts.student_discord_id) LIKE LOWER(?) OR LOWER(attempts.code) LIKE LOWER(?) OR LOWER(quizzes.title) LIKE LOWER(?))",
    values: [`%${normalized}%`, `%${normalized}%`, `%${normalized}%`, `%${normalized}%`],
  };
}

function validatePageRequest(request: ManagementAttemptPageRequest) {
  const page = request.page ?? 1;
  const pageSize = request.pageSize ?? 50;
  if (!Number.isInteger(page) || page < 1) throw new Error("Attempt page must be a positive integer");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new Error("Attempt page size must be between 1 and 100");
  if (request.query !== undefined && typeof request.query !== "string") throw new Error("Attempt query must be a string");
  return { page, pageSize };
}

async function findManagementAttemptSummary(attemptId: string): Promise<ManagementAttemptSummary | null> {
  const [row] = await queryReadOnly<ManagementAttemptRow[]>(
    `SELECT ${managementAttemptColumns}
     FROM attempts JOIN quizzes ON quizzes.id = attempts.quiz_id
     WHERE attempts.id = ? LIMIT 1`,
    [attemptId],
  );
  return row ? normalizeAttemptRow(row) : null;
}

export async function listManagementAttempts(page: ManagementAttemptPage = {}): Promise<ManagementAttemptSummary[]> {
  const { limit, offset } = validatePage(page);
  const rows = await queryReadOnly<ManagementAttemptRow[]>(
    `SELECT ${managementAttemptColumns}
     FROM attempts JOIN quizzes ON quizzes.id = attempts.quiz_id
     ORDER BY attempts.submitted_at DESC, attempts.id DESC
     LIMIT ? OFFSET ?`,
    [limit, offset],
  );
  return rows.map(normalizeAttemptRow);
}

/** Management API list contract with server-side case-insensitive search and pagination metadata. */
export async function listManagementAttemptPage(request: ManagementAttemptPageRequest = {}): Promise<ManagementAttemptPageResult> {
  const { page, pageSize } = validatePageRequest(request);
  const search = managementAttemptSearch(request.query);
  const [countRow] = await queryReadOnly<Array<RowDataPacket & { total: number }>>(
    `SELECT COUNT(*) AS total FROM attempts JOIN quizzes ON quizzes.id = attempts.quiz_id${search.where}`,
    search.values,
  );
  const rows = await queryReadOnly<ManagementAttemptRow[]>(
    `SELECT ${managementAttemptColumns}
     FROM attempts JOIN quizzes ON quizzes.id = attempts.quiz_id${search.where}
     ORDER BY attempts.submitted_at DESC, attempts.id DESC
     LIMIT ? OFFSET ?`,
    [...search.values, pageSize, (page - 1) * pageSize],
  );
  return { attempts: rows.map(normalizeAttemptRow), page, pageSize, total: Number(countRow?.total ?? 0) };
}

export async function getManagementAttempt(attemptId: string): Promise<ManagementAttemptDetail | null> {
  if (!isQuizId(attemptId)) throw new Error("Attempt IDs must be UUIDs");
  const [summary, attempt] = await Promise.all([
    findManagementAttemptSummary(attemptId),
    getAttemptByReference(attemptId),
  ]);
  if (!summary || !attempt) return null;
  return { ...summary, review: getAttemptReview(attempt.questionSnapshot) };
}

export async function deleteManagementAttempt(attemptId: string): Promise<void> {
  if (!isQuizId(attemptId)) throw new Error("Attempt IDs must be UUIDs");
  assertManagementWritesEnabled();
  await withWriteTransaction(async (connection) => {
    await connection.execute("DELETE FROM attempt_answers WHERE attempt_id = ?", [attemptId]);
    const [result] = await connection.execute<ResultSetHeader>("DELETE FROM attempts WHERE id = ?", [attemptId]);
    if (result.affectedRows !== 1) throw new Error("Attempt not found");
  });
}
