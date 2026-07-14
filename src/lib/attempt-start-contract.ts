import { createHmac, randomBytes, timingSafeEqual, createHash } from "node:crypto";

import type { QuizQuestion } from "./exams-repository";

const attemptStartCookiePrefix = "atcmh_exams_attempt_start_";
const quizUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function attemptStartCookieName(quizId: string): string {
  if (!quizUuid.test(quizId)) throw new Error("Quiz ID must be a valid UUID");
  return `${attemptStartCookiePrefix}${quizId.replace(/-/g, "").toLowerCase()}`;
}

export interface AttemptStart {
  discordId: string;
  quizId: string;
  nonce: string;
  startedAt: number;
  deadline: number | null;
}

export function attemptIdForStart(start: AttemptStart): string {
  const bytes = createHash("sha256")
    .update(JSON.stringify([start.discordId, start.quizId, start.nonce]))
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const encode = (value: Buffer | string) => Buffer.from(value).toString("base64url");
const signature = (secret: string, payload: string) => createHmac("sha256", secret).update(payload).digest("base64url");

export function createAttemptStart(
  secret: string,
  input: { discordId: string; quizId: string; timeLimitSeconds: number },
  nowSeconds = Math.floor(Date.now() / 1_000),
  createNonce = () => randomBytes(24).toString("base64url"),
): AttemptStart & { token: string } {
  const contract: AttemptStart = {
    discordId: input.discordId,
    quizId: input.quizId,
    nonce: createNonce(),
    startedAt: nowSeconds,
    deadline: input.timeLimitSeconds > 0 ? nowSeconds + input.timeLimitSeconds : null,
  };
  const payload = encode(JSON.stringify(contract));
  return { ...contract, token: `${payload}.${signature(secret, payload)}` };
}

export function readAttemptStart(
  secret: string,
  token: string | undefined,
  discordId: string,
  quizId: string,
  _nowSeconds = Math.floor(Date.now() / 1_000),
): AttemptStart | undefined {
  if (!token || secret.length < 32) return undefined;
  const [payload, suppliedSignature, ...extra] = token.split(".");
  if (!payload || !suppliedSignature || extra.length) return undefined;
  const expected = Buffer.from(signature(secret, payload));
  const supplied = Buffer.from(suppliedSignature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return undefined;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<AttemptStart>;
    if (value.discordId !== discordId || value.quizId !== quizId) return undefined;
    if (typeof value.nonce !== "string" || value.nonce.length < 1 || !Number.isInteger(value.startedAt)) return undefined;
    if (value.deadline !== null && !Number.isInteger(value.deadline)) return undefined;
    return value as AttemptStart;
  } catch {
    return undefined;
  }
}

function deterministicOrder<T extends { id: string }>(items: readonly T[], seed: string): T[] {
  return [...items].sort((left, right) => {
    const leftHash = createHash("sha256").update(`${seed}:${left.id}`).digest("hex");
    const rightHash = createHash("sha256").update(`${seed}:${right.id}`).digest("hex");
    return leftHash.localeCompare(rightHash);
  });
}

export function orderAttemptQuestions(
  questions: readonly QuizQuestion[],
  randomizeQuestions: boolean,
  nonce: string,
): QuizQuestion[] {
  const orderedQuestions = randomizeQuestions
    ? deterministicOrder(questions, `${nonce}:questions`)
    : [...questions];
  return orderedQuestions.map((question) => ({
    ...question,
    options: question.randomizeOptions
      ? deterministicOrder(question.options, `${nonce}:options:${question.id}`)
      : [...question.options],
  }));
}
