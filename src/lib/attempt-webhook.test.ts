import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildAttemptWebhookPayload, type AttemptWebhookInput } from "./attempt-webhook-payload";

const input: AttemptWebhookInput = {
  quizTitle: "Tower Basics",
  discordId: "123456789012345678",
  score: 8,
  total: 10,
  percentage: 80,
  submissionReason: "manual",
  attemptCode: "ATCMH-ATTEMPT-1",
  attemptId: "attempt-1",
  submittedAt: new Date("2026-07-11T08:30:00.000Z"),
  attemptUrl: new URL("https://exams.atcmh.org/exams/attempts/attempt-1"),
};

test("requires the canonical attempt URL and exposes no base URL fallback", () => {
  const source = readFileSync(new URL("./attempt-webhook-payload.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /appBaseUrl|new URL\s*\(/);

  const missingAttemptUrl = {
    quizTitle: "Tower Basics",
    discordId: "123456789012345678",
    score: 8,
    total: 10,
    percentage: 80,
    submissionReason: "manual" as const,
    attemptCode: "ATCMH-ATTEMPT-1",
    attemptId: "attempt-1",
    submittedAt: new Date("2026-07-11T08:30:00.000Z"),
  };
  // @ts-expect-error attemptUrl is deliberately mandatory.
  const rejectedByContract: AttemptWebhookInput = missingAttemptUrl;
  assert.equal(rejectedByContract.attemptUrl, undefined);
});

test("marks the webhook helper as server-only", () => {
  const source = readFileSync(new URL("./attempt-webhook.ts", import.meta.url), "utf8");
  assert.match(source, /^import ["']server-only["'];/);
});

test("delivery behavior passes under the narrowly scoped server condition", () => {
  const result = spawnSync(
    process.execPath,
    ["--conditions=react-server", "--import", "tsx", "--test", new URL("./attempt-webhook-delivery.case.ts", import.meta.url).pathname],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("builds the Discord attempt embed and permits only the verified learner mention", () => {
  const payload = buildAttemptWebhookPayload(input);

  assert.deepEqual(payload.allowed_mentions, { parse: [], users: [input.discordId] });
  assert.equal(payload.embeds.length, 1);
  assert.deepEqual(payload.embeds[0], {
    author: { name: "ATCMH Exam Center" },
    title: "Quiz Attempt",
    description: "Tower Basics",
    color: 0x22c55e,
    fields: [
      { name: "Student", value: "<@123456789012345678>", inline: true },
      { name: "Result", value: "8/10 (80%)", inline: true },
      { name: "Submission", value: "Submitted manually", inline: true },
      { name: "Attempt Code", value: "ATCMH-ATTEMPT-1", inline: true },
      { name: "View Attempt", value: "[Open Attempt](https://exams.atcmh.org/exams/attempts/attempt-1)" },
    ],
    timestamp: "2026-07-11T08:30:00.000Z",
  });
});

test("uses timeout submission copy", () => {
  const payload = buildAttemptWebhookPayload({ ...input, submissionReason: "timeout" });
  assert.equal(payload.embeds[0].fields.find((field) => field.name === "Submission")?.value, "Submitted on timeout");
});
