import { createHash, createHmac, randomUUID } from "node:crypto";
import type { PoolConnection } from "mysql2/promise";

import { quizImportSchema, type NormalizedImport } from "./import-schema";

export interface ImportError { path: string; message: string }
export interface ImportValidation {
  valid: boolean;
  errors: ImportError[];
  normalizedImport?: NormalizedImport;
}

export const csvTemplate = "quiz_title,category,question_prompt,option_text,is_correct,question_sort,option_sort";

function errorPath(path: readonly (string | number)[]) {
  return path.reduce<string>((result, segment) => typeof segment === "number" ? `${result}[${segment}]` : result ? `${result}.${segment}` : segment, "");
}

export function validateImport(value: unknown): ImportValidation {
  const parsed = quizImportSchema.safeParse(value);
  if (!parsed.success) {
    return { valid: false, errors: parsed.error.issues.map((issue) => ({ path: errorPath(issue.path), message: issue.message })) };
  }
  return { valid: true, errors: [], normalizedImport: parsed.data };
}

/** The CSV format deliberately contains only portable question/option fields. */
export function parseCsvImport(csv: string): ImportValidation {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length < 2 || lines[0] !== csvTemplate) {
    return { valid: false, errors: [{ path: "row 1", message: `header must be ${csvTemplate}` }] };
  }
  const rows = lines.slice(1).map((line, index) => ({ row: index + 2, values: line.split(",") }));
  const rowErrors: ImportError[] = [];
  const groups = new Map<string, { title: string; category: string; questions: Map<string, { sort: number; prompt: string; options: Array<{ sort: number; text: string; isCorrect: boolean }> }> }>();
  for (const { row, values } of rows) {
    if (values.length !== 7) { rowErrors.push({ path: `row ${row}`, message: "expected seven CSV columns" }); continue; }
    const [title, category, prompt, text, correct, questionSort, optionSort] = values.map((value) => value.trim());
    if (correct !== "true" && correct !== "false") rowErrors.push({ path: `row ${row}.is_correct`, message: "must be true or false" });
    const questionOrder = Number(questionSort); const optionOrder = Number(optionSort);
    if (!Number.isInteger(questionOrder) || questionOrder < 1) rowErrors.push({ path: `row ${row}.question_sort`, message: "must be a positive integer" });
    if (!Number.isInteger(optionOrder) || optionOrder < 1) rowErrors.push({ path: `row ${row}.option_sort`, message: "must be a positive integer" });
    const key = `${title}\u0000${category}`;
    const group = groups.get(key) ?? { title, category, questions: new Map() };
    groups.set(key, group);
    const question = group.questions.get(`${questionOrder}\u0000${prompt}`) ?? { sort: questionOrder, prompt, options: [] };
    group.questions.set(`${questionOrder}\u0000${prompt}`, question);
    question.options.push({ sort: optionOrder, text, isCorrect: correct === "true" });
  }
  if (rowErrors.length > 0) return { valid: false, errors: rowErrors };
  if (groups.size !== 1) return { valid: false, errors: [{ path: "csv", message: "a CSV file must contain exactly one quiz" }] };
  const group = [...groups.values()][0];
  return validateImport({
    title: group.title, category: group.category, feedbackMode: "after_submission", timeLimitSeconds: 0,
    questions: [...group.questions.values()].sort((a, b) => a.sort - b.sort).map((question) => ({
      prompt: question.prompt,
      options: question.options.sort((a, b) => a.sort - b.sort).map(({ text, isCorrect }) => ({ text, isCorrect })),
    })),
  });
}

export function payloadHash(payload: NormalizedImport): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

/** Opaque preview key binds the normalized payload to the requesting Discord identity. */
export function requireImportIdempotencySecret(): string {
  const secret = process.env.IMPORT_IDEMPOTENCY_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("IMPORT_IDEMPOTENCY_SECRET must be at least 32 characters when management writes are enabled");
  }
  return secret;
}

export function createPreviewNonce(): string {
  return randomUUID();
}

export function previewBinding(nonce: string, payloadDigest: string, discordId: string): string {
  return createHmac("sha256", requireImportIdempotencySecret()).update(`${nonce}:${payloadDigest}:${discordId}`).digest("hex");
}

export type ImportWriteConnection = Pick<PoolConnection, "execute">;
export interface ImportCommitResult { quizId: string; questionIds: string[]; optionIds: string[]; idempotencyKey: string }

/**
 * Caller owns the transaction. All writes use fresh IDs and the final audit
 * row makes a duplicate key fail under the audit table's unique index.
 */
export async function writeImport(connection: ImportWriteConnection, input: {
  normalizedImport: NormalizedImport; categoryId: string; tagIds: string[]; importedByDiscordId: string; idempotencyKey: string;
  impersonation?: { realActorAccountId: string; impersonatedAccountId: string; impersonatedDiscordId: string };
}): Promise<ImportCommitResult> {
  const quizId = randomUUID();
  const questionIds: string[] = []; const optionIds: string[] = [];
  const payloadDigest = payloadHash(input.normalizedImport);
  const now = new Date().toISOString();
  await connection.execute(
    `INSERT INTO quizzes (id, title, description, category_id, feedback_mode, time_limit_seconds, created_at, updated_at, randomize_questions, is_private)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [quizId, input.normalizedImport.title, input.normalizedImport.description, input.categoryId, input.normalizedImport.feedbackMode,
      input.normalizedImport.timeLimitSeconds, now, now, input.normalizedImport.randomizeQuestions, input.normalizedImport.isPrivate],
  );
  for (const [questionIndex, question] of input.normalizedImport.questions.entries()) {
    const questionId = randomUUID(); questionIds.push(questionId);
    const optionIdsForQuestion = question.options.map(() => randomUUID());
    const correctOptionId = optionIdsForQuestion[question.options.findIndex((option) => option.isCorrect)];
    await connection.execute(
      `INSERT INTO quiz_questions (id, quiz_id, prompt, correct_option_id, sort_order, randomize_options) VALUES (?, ?, ?, ?, ?, ?)`,
      [questionId, quizId, question.prompt, correctOptionId, questionIndex + 1, question.randomizeOptions],
    );
    for (const [optionIndex, option] of question.options.entries()) {
      const optionId = optionIdsForQuestion[optionIndex]; optionIds.push(optionId);
      await connection.execute(`INSERT INTO quiz_options (id, question_id, text, sort_order) VALUES (?, ?, ?, ?)`, [optionId, questionId, option.text, optionIndex + 1]);
    }
  }
  for (const tagId of input.tagIds) {
    await connection.execute("INSERT INTO quiz_tags (quiz_id, tag_id) VALUES (?, ?)", [quizId, tagId]);
  }
  await connection.execute(
    `INSERT INTO exam_import_audit (idempotency_key, payload_hash, imported_by_discord_id, result_quiz_id, result_ids)
     VALUES (?, ?, ?, ?, ?)`,
    [input.idempotencyKey, payloadDigest, input.importedByDiscordId, quizId, JSON.stringify({ questionIds, optionIds,
      ...(input.impersonation ? { impersonation: input.impersonation } : {}) })],
  );
  return { quizId, questionIds, optionIds, idempotencyKey: input.idempotencyKey };
}
