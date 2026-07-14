import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { attemptIdForStart, attemptStartCookieName, createAttemptStart, orderAttemptQuestions, readAttemptStart } from "./attempt-start-contract";

const secret = "s".repeat(32);
const quizId = "c2a07cd2-3e2e-482e-b2ee-9d5c6fec6bc4";
const discordId = "123456789012345678";

test("the start cookie is available to both the start route and attempt page", () => {
  const source = readFileSync(new URL("../app/exams/api/quizzes/[quizId]/start/route.ts", import.meta.url), "utf8");
  assert.match(source, /examsCookieOptions/);
});

test("attempt cookie names are isolated per validated quiz UUID", () => {
  const quizA = "c2a07cd2-3e2e-482e-b2ee-9d5c6fec6bc4";
  const quizB = "11111111-2222-4333-8444-555555555555";

  assert.notEqual(attemptStartCookieName(quizA), attemptStartCookieName(quizB));
  assert.match(attemptStartCookieName(quizA), /^atcmh_exams_attempt_start_[0-9a-f]{32}$/);
  assert.throws(() => attemptStartCookieName("../../unsafe"), /valid UUID/);
});

test("one start always resolves to one opaque attempt UUID", () => {
  const start = createAttemptStart(secret, {
    discordId: "123456789012345",
    quizId,
    timeLimitSeconds: 900,
  }, 1_000, () => "nonce-a");

  assert.equal(attemptIdForStart(start), attemptIdForStart(start));
  assert.match(attemptIdForStart(start), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(attemptIdForStart(start), attemptIdForStart({ ...start, nonce: "nonce-b" }));
});

test("starting quiz B cannot overwrite quiz A's deadline or randomization nonce", () => {
  const quizA = "c2a07cd2-3e2e-482e-b2ee-9d5c6fec6bc4";
  const quizB = "11111111-2222-4333-8444-555555555555";
  const cookies = new Map<string, string>();
  const startA = createAttemptStart(secret, { discordId, quizId: quizA, timeLimitSeconds: 600 }, 1_000, () => "nonce-a");
  cookies.set(attemptStartCookieName(quizA), startA.token);
  const startB = createAttemptStart(secret, { discordId, quizId: quizB, timeLimitSeconds: 300 }, 1_100, () => "nonce-b");
  cookies.set(attemptStartCookieName(quizB), startB.token);

  const returnedA = readAttemptStart(secret, cookies.get(attemptStartCookieName(quizA)), discordId, quizA, 1_200);
  assert.equal(returnedA?.deadline, 1_600);
  assert.equal(returnedA?.nonce, "nonce-a");
});

test("signed attempt start rejects tampering and identity or quiz mismatches", () => {
  const start = createAttemptStart(secret, { discordId, quizId, timeLimitSeconds: 600 }, 1_000, () => "nonce-a");

  assert.equal(readAttemptStart(secret, `${start.token}x`, discordId, quizId, 1_001), undefined);
  assert.equal(readAttemptStart(secret, start.token, "999999999999999999", quizId, 1_001), undefined);
  assert.equal(readAttemptStart(secret, start.token, discordId, "11111111-2222-4333-8444-555555555555", 1_001), undefined);
});

test("signed attempt start preserves its server deadline after expiry for timeout persistence", () => {
  const start = createAttemptStart(secret, { discordId, quizId, timeLimitSeconds: 60 }, 1_000, () => "nonce-a");
  const read = readAttemptStart(secret, start.token, discordId, quizId, 1_061);

  assert.equal(read?.startedAt, 1_000);
  assert.equal(read?.deadline, 1_060);
});

const questions = [
  { id: "q1", prompt: "One", correctOptionId: "a1", sortOrder: 1, randomizeOptions: true, options: [
    { id: "a1", text: "A", sortOrder: 1 }, { id: "a2", text: "B", sortOrder: 2 }, { id: "a3", text: "C", sortOrder: 3 },
  ] },
  { id: "q2", prompt: "Two", correctOptionId: "b1", sortOrder: 2, randomizeOptions: false, options: [
    { id: "b1", text: "A", sortOrder: 1 }, { id: "b2", text: "B", sortOrder: 2 },
  ] },
  { id: "q3", prompt: "Three", correctOptionId: "c1", sortOrder: 3, randomizeOptions: false, options: [
    { id: "c1", text: "A", sortOrder: 1 }, { id: "c2", text: "B", sortOrder: 2 },
  ] },
];

test("attempt ordering is stable for reloads and honors randomization flags", () => {
  const first = orderAttemptQuestions(questions, true, "nonce-a");
  const reload = orderAttemptQuestions(questions, true, "nonce-a");

  assert.deepEqual(reload, first);
  const q1 = first.find((question) => question.id === "q1")!;
  const q2 = first.find((question) => question.id === "q2")!;
  assert.notDeepEqual(q1.options.map((option) => option.id), ["a1", "a2", "a3"]);
  assert.deepEqual(q2.options.map((option) => option.id), ["b1", "b2"]);
});

test("different attempt seeds can produce different question and option orders", () => {
  const first = orderAttemptQuestions(questions, true, "nonce-a");
  const second = orderAttemptQuestions(questions, true, "nonce-b");

  assert.notDeepEqual(
    first.map((question) => `${question.id}:${question.options.map((option) => option.id).join(",")}`),
    second.map((question) => `${question.id}:${question.options.map((option) => option.id).join(",")}`),
  );
});
