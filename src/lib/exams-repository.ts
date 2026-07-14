import type { RowDataPacket } from "mysql2";
import { queryReadOnly } from "./db";
import type { StoredAttempt } from "./attempt-service";
import type { LearnerAccessContext } from "./learner-access";

export interface QuizSummary {
  id: string;
  title: string;
  description: string;
  categoryId: string;
  category: string;
  feedbackMode: string;
  timeLimitSeconds: number;
  randomizeQuestions: boolean;
  isPrivate: boolean;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  correctOptionId: string;
  sortOrder: number;
  randomizeOptions: boolean;
  options: Array<{ id: string; text: string; sortOrder: number }>;
}

export interface Quiz extends QuizSummary {
  tags: Array<{ id: string; name: string }>;
  questions: QuizQuestion[];
  bankDraws: Array<{ questionBankId: string; questionCount: number; sortOrder: number }>;
}

type QuizRow = RowDataPacket & {
  id: string; title: string; description: string; category_id: string; feedback_mode: string;
  category_name: string; time_limit_seconds: number; randomize_questions: number; is_private: number;
};

export const isQuizId = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const isDiscordId = (value: string) => /^\d{15,20}$/.test(value);

let readOnlyQuery = queryReadOnly;

/** Test seam; application code always uses the database module. */
export function setReadOnlyQueryForTests(query: typeof queryReadOnly) {
  readOnlyQuery = query;
}

function toSummary(row: QuizRow): QuizSummary {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    categoryId: row.category_id,
    category: row.category_name,
    feedbackMode: row.feedback_mode,
    timeLimitSeconds: row.time_limit_seconds,
    randomizeQuestions: Boolean(row.randomize_questions),
    isPrivate: Boolean(row.is_private),
  };
}

const quizColumns = "q.id, q.title, q.description, q.category_id, c.name AS category_name, q.feedback_mode, q.time_limit_seconds, q.randomize_questions, q.is_private";

/** Unauthenticated catalogue data; private quizzes are intentionally excluded. */
export async function listPublicQuizzes(): Promise<QuizSummary[]> {
  const rows = await readOnlyQuery<QuizRow[]>(
    `SELECT ${quizColumns} FROM quizzes q JOIN categories c ON c.id = q.category_id WHERE q.is_private = FALSE ORDER BY q.title ASC`,
  );
  return rows.map(toSummary);
}

/**
 * Management catalogue data. Authorization is enforced by the caller using a
 * Discord-derived actor; it intentionally includes private drafts.
 */
export async function listManagedQuizzes(): Promise<QuizSummary[]> {
  const rows = await readOnlyQuery<QuizRow[]>(`SELECT ${quizColumns} FROM quizzes q JOIN categories c ON c.id = q.category_id ORDER BY q.title ASC`);
  return rows.map(toSummary);
}

export async function listEligibleQuizzes(context: LearnerAccessContext): Promise<QuizSummary[]> {
  if (!isDiscordId(context.discordId)) {
    throw new Error("Discord IDs must be valid snowflakes");
  }
  if (context.canAccessPrivateQuizzes) return listManagedQuizzes();

  const rows = await readOnlyQuery<QuizRow[]>(
    `SELECT ${quizColumns} FROM quizzes q JOIN categories c ON c.id = q.category_id
     WHERE q.is_private = FALSE
        OR EXISTS (SELECT 1 FROM quiz_unlocks u WHERE u.quiz_id = q.id AND u.user_id = ?)
     ORDER BY q.title ASC`,
    [context.discordId],
  );
  return rows.map(toSummary);
}

export async function getQuiz(id: string): Promise<Quiz | null> {
  if (!isQuizId(id)) {
    throw new Error("Quiz IDs must be UUIDs");
  }
  const [quiz] = await readOnlyQuery<QuizRow[]>(`SELECT ${quizColumns} FROM quizzes q JOIN categories c ON c.id = q.category_id WHERE q.id = ? LIMIT 1`, [id]);
  if (!quiz) return null;

  const [tagRows, questionRows, optionRows, bankDrawRows] = await Promise.all([
    readOnlyQuery<RowDataPacket[]>(
      "SELECT t.id, t.name FROM quiz_tags qt JOIN tags t ON t.id = qt.tag_id WHERE qt.quiz_id = ? ORDER BY t.name ASC", [id]),
    readOnlyQuery<RowDataPacket[]>(
      "SELECT id, prompt, correct_option_id, sort_order, randomize_options FROM quiz_questions WHERE quiz_id = ? ORDER BY sort_order ASC", [id]),
    readOnlyQuery<RowDataPacket[]>(
      "SELECT qo.id, qo.question_id, qo.text, qo.sort_order FROM quiz_options qo JOIN quiz_questions qq ON qq.id = qo.question_id WHERE qq.quiz_id = ? ORDER BY qo.sort_order ASC", [id]),
    readOnlyQuery<RowDataPacket[]>(
      "SELECT question_bank_id, question_count, sort_order FROM quiz_bank_draws WHERE quiz_id = ? ORDER BY sort_order ASC", [id]),
  ]);

  const optionsByQuestion = new Map<string, QuizQuestion["options"]>();
  for (const option of optionRows) {
    const options = optionsByQuestion.get(option.question_id) ?? [];
    options.push({ id: option.id, text: option.text, sortOrder: option.sort_order });
    optionsByQuestion.set(option.question_id, options);
  }
  return {
    ...toSummary(quiz),
    tags: tagRows.map((tag) => ({ id: tag.id, name: tag.name })),
    questions: questionRows.map((question) => ({
      id: question.id,
      prompt: question.prompt,
      correctOptionId: question.correct_option_id,
      sortOrder: question.sort_order,
      randomizeOptions: Boolean(question.randomize_options),
      options: optionsByQuestion.get(question.id) ?? [],
    })),
    bankDraws: bankDrawRows.map((draw) => ({
      questionBankId: draw.question_bank_id,
      questionCount: draw.question_count,
      sortOrder: draw.sort_order,
    })),
  };
}

/**
 * Resolves a quiz only after its public/unlock gate is evaluated against a
 * server-derived Discord subject. This keeps private content out of route
 * rendering for unauthenticated or non-unlocked learners.
 */
export async function getQuizForLearner(id: string, context: LearnerAccessContext): Promise<Quiz | null> {
  if (!isQuizId(id)) throw new Error("Quiz IDs must be UUIDs");
  if (!isDiscordId(context.discordId)) throw new Error("Discord IDs must be valid snowflakes");
  if (context.canAccessPrivateQuizzes) return getQuiz(id);

  const [gate] = await readOnlyQuery<Array<RowDataPacket & { id: string; is_private: number }>>(
    "SELECT id, is_private FROM quizzes WHERE id = ? LIMIT 1", [id],
  );
  if (!gate) return null;
  if (!gate.is_private) return getQuiz(id);
  const [unlock] = await readOnlyQuery<RowDataPacket[]>(
    "SELECT 1 FROM quiz_unlocks WHERE quiz_id = ? AND user_id = ? LIMIT 1", [id, context.discordId],
  );
  if (!unlock) throw new Error("Quiz is not available to this learner");
  return getQuiz(id);
}

type AttemptRow = RowDataPacket & {
  id: string;
  student_name: string;
  /** Present only on attempts created during the interim additive-schema release. */
  student_discord_id?: string | null;
  quiz_id: string;
  score: number;
  total: number;
  percentage: number;
  question_snapshot: string | object;
  submission_reason: "manual" | "timeout";
};

type AttemptAnswerRow = RowDataPacket & {
  question_id: string;
  selected_option_id: string | null;
  correct: number | boolean;
};

const discordMentionSubject = (value: string) => /^<@!?(\d{15,20})>$/.exec(value)?.[1] ?? null;
const discordSnowflake = (value: string | null | undefined) => value && /^\d{15,20}$/.test(value) ? value : null;

/** Resolves only canonical legacy mentions or an interim stored snowflake. */
export function parseAttemptStudentDiscordId(studentName: string, studentDiscordId?: string | null): string | null {
  return discordMentionSubject(studentName) ?? discordSnowflake(studentDiscordId);
}

function isVersionedAttemptSnapshot(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && (value as { version?: unknown }).version === 2);
}

const isAttemptCode = (value: string) => /^[0-9a-f]{32}$/i.test(value);

export async function getAttemptByReference(reference: string): Promise<StoredAttempt | null> {
  const lookupColumn = isQuizId(reference) ? "id" : isAttemptCode(reference) ? "code" : null;
  if (!lookupColumn) throw new Error("Attempt reference must be a UUID or 32-character code");
  const canonicalReference = lookupColumn === "code" ? reference.toLowerCase() : reference;
  const [row] = await readOnlyQuery<AttemptRow[]>(
    `SELECT attempts.*
     FROM attempts WHERE ${lookupColumn} = ? LIMIT 1`,
    [canonicalReference],
  );
  if (!row) return null;
  const storedSnapshot = typeof row.question_snapshot === "string" ? JSON.parse(row.question_snapshot) : row.question_snapshot;
  let questionSnapshot = storedSnapshot;
  if (Array.isArray(storedSnapshot) && !isVersionedAttemptSnapshot(storedSnapshot)) {
    const answerRows = await readOnlyQuery<AttemptAnswerRow[]>(
      "SELECT question_id, selected_option_id, correct FROM attempt_answers WHERE attempt_id = ?",
      [row.id],
    );
    const answerByQuestion = new Map(answerRows.map((answer) => [answer.question_id, answer]));
    questionSnapshot = {
      version: 2,
      feedbackMode: "after_submission",
      questions: storedSnapshot.map((question: Record<string, unknown>) => {
        const answer = answerByQuestion.get(String(question.id));
        const selectedOptionId = answer?.selected_option_id ?? null;
        const selectedIsCorrect = Boolean(answer?.correct);
        const optionIds = Array.isArray(question.optionIds)
          ? question.optionIds.filter((optionId): optionId is string => typeof optionId === "string")
          : [];
        if (optionIds.length > 0 && !Array.isArray(question.options)) {
          const options = optionIds.map((id, index) => ({ id, text: `Stored option ${index + 1}` }));
          if (selectedOptionId !== null && !optionIds.includes(selectedOptionId)) {
            options.push({ id: selectedOptionId, text: "Recorded answer (option text unavailable)" });
          }
          return {
            id: question.id,
            prompt: question.prompt,
            options,
            selectedOptionId,
            selectedIsCorrect,
            // Legacy ID-only snapshots did not persist the correct answer. In
            // redacted mode this field is validation-only and is never shown.
            correctOptionId: null,
          };
        }
        const options = Array.isArray(question.options) ? [...question.options] : question.options;
        if (selectedOptionId !== null
          && Array.isArray(options)
          && !options.some((option) => option && typeof option === "object" && (option as { id?: unknown }).id === selectedOptionId)) {
          options.push({ id: selectedOptionId, text: "Recorded answer (option text unavailable)" });
        }
        return {
          ...question,
          options,
          selectedOptionId,
          selectedIsCorrect,
        };
      }),
    };
  }
  return {
    id: row.id,
    studentDiscordId: parseAttemptStudentDiscordId(row.student_name, row.student_discord_id),
    quizId: row.quiz_id,
    score: row.score,
    total: row.total,
    percentage: row.percentage,
    questionSnapshot,
    submissionReason: row.submission_reason,
  };
}

/** @deprecated Prefer getAttemptByReference for learner result routes. */
export const getAttemptById = getAttemptByReference;
