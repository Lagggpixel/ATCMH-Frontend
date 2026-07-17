import assert from "node:assert/strict";
import test from "node:test";

import { attemptCompletedAuditEvent, attemptStartedAuditEvent } from "./attempt-audit";

const ids = {
  attemptId: "6c49cc19-7714-421a-9d95-0dc7be32e782",
  quizId: "8d1b564e-1f89-4550-a7dd-e6e8cb32b820",
  learnerDiscordId: "123456789012345678",
};

test("builds a learner attempt-start event without quiz data or answers", () => {
  const event = attemptStartedAuditEvent({ ...ids, startedAt: new Date("2026-07-12T12:00:00.000Z") });
  assert.deepEqual(event, {
    action: "exam.attempt.started",
    actorId: ids.learnerDiscordId,
    targetType: "attempt",
    targetId: ids.attemptId,
    summary: "Learner started a quiz attempt.",
    details: {
      quizId: ids.quizId,
      learnerDiscordId: ids.learnerDiscordId,
      startedAt: "2026-07-12T12:00:00.000Z",
    },
  });
  assert.equal(JSON.stringify(event).includes("answers"), false);
});

test("impersonated learner audit attributes the real actor and names the target", () => {
  const event = attemptStartedAuditEvent({ ...ids, startedAt: new Date("2026-07-12T12:00:00.000Z"),
    actorDiscordId: "999999999999999999", actorAccountId: "7", learnerAccountId: "42", impersonating: true });
  assert.equal(event.actorId, "999999999999999999");
  assert.equal(event.details?.impersonatedDiscordId, ids.learnerDiscordId);
  assert.equal(event.details?.impersonatedAccountId, "42");
  assert.equal(event.details?.realActorAccountId, "7");
});

test("separates manual and timeout completion events with trusted notification metadata", () => {
  const notification = { attemptCode: ids.attemptId.replaceAll("-", ""), quizTitle: "Tower Basics" };
  const manual = attemptCompletedAuditEvent({ ...ids, ...notification, submittedAt: new Date("2026-07-12T12:10:00.000Z"), score: 8, total: 10, percentage: 80, submissionReason: "manual" });
  const timeout = attemptCompletedAuditEvent({ ...ids, ...notification, submittedAt: new Date("2026-07-12T12:10:00.000Z"), score: 7, total: 10, percentage: 70, submissionReason: "timeout" });

  assert.equal(manual.action, "exam.attempt.submitted");
  assert.equal(timeout.action, "exam.attempt.timed_out");
  assert.deepEqual(manual.details, {
    quizId: ids.quizId,
    quizTitle: "Tower Basics",
    attemptCode: ids.attemptId.replaceAll("-", ""),
    learnerDiscordId: ids.learnerDiscordId,
    score: 8,
    total: 10,
    percentage: 80,
    submissionReason: "manual",
    submittedAt: "2026-07-12T12:10:00.000Z",
  });
});
