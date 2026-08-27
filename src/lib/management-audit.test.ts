import assert from "node:assert/strict";
import test from "node:test";

import type { Quiz } from "./exams-repository";
import {
  quizCategoryCreatedAuditEvent,
  quizCategoryMovedAuditEvent,
  quizImportedAuditEvent,
  quizSavedAuditEvent,
  quizUnlockAuditEvent,
} from "./management-audit";
import type { ManagementActor } from "./permissions";

const actor: ManagementActor = {
  accountId: "account-1",
  discordId: "123456789012345",
  canManageAll: true,
  capabilities: ["manage-exams", "manage-system"],
};
const quiz: Quiz = {
  id: "c2a07cd2-3e2e-482e-b2ee-9d5c6fec6bc4",
  title: "Tower fundamentals",
  description: "Sensitive description",
  categoryId: "a447a1c6-0d75-4d09-93d9-1d902c7ed1df",
  category: "Tower",
  feedbackMode: "after_submission",
  timeLimitSeconds: 900,
  randomizeQuestions: false,
  isPrivate: true,
  tags: [{id: "tag-1", name: "Fundamentals"}],
  questions: [{
    id: "question-1",
    prompt: "SECRET QUESTION",
    correctOptionId: "option-1",
    sortOrder: 1,
    randomizeOptions: false,
    options: [{id: "option-1", text: "SECRET ANSWER", sortOrder: 1}],
  }],
  bankDraws: [],
};

test("quiz management events name safe metadata without question or answer content", () => {
  const events = [
    quizSavedAuditEvent(quiz, actor, "create"),
    quizSavedAuditEvent(quiz, actor, "update"),
    quizCategoryMovedAuditEvent(quiz, actor),
    quizUnlockAuditEvent({quizId: quiz.id, discordId: "999999999999999", userName: "Learner", unlocked: true}, actor),
    quizCategoryCreatedAuditEvent({id: quiz.categoryId, name: quiz.category, parentId: null}, actor),
  ];

  assert.deepEqual(events.map(event => event.action), [
    "exam.quiz.create",
    "exam.quiz.update",
    "exam.quiz.category.move",
    "exam.quiz.unlock.grant",
    "exam.quiz.category.create",
  ]);
  assert.equal(events.every(event => event.actorId === actor.discordId), true);
  assert.equal(JSON.stringify(events).includes("SECRET QUESTION"), false);
  assert.equal(JSON.stringify(events).includes("SECRET ANSWER"), false);
});

test("repeatable quiz mutations receive distinct audit ids while imports reuse their idempotency key", () => {
  const first = quizSavedAuditEvent(quiz, actor, "update");
  const second = quizSavedAuditEvent(quiz, actor, "update");
  assert.notEqual(first.eventId, second.eventId);

  const imported = quizImportedAuditEvent(quiz.id, "preview-key", actor);
  assert.equal(imported.eventId, "exam-import:preview-key");
});

test("management audit details preserve real-actor impersonation context", () => {
  const impersonating: ManagementActor = {
    ...actor,
    impersonating: true,
    impersonatedAccountId: "account-2",
    impersonatedDiscordId: "999999999999999",
  };
  const event = quizUnlockAuditEvent({quizId: quiz.id, discordId: "888888888888888", unlocked: false}, impersonating);

  assert.equal(event.action, "exam.quiz.unlock.revoke");
  assert.equal(event.details?.actorAccountId, "account-1");
  assert.equal(event.details?.impersonatedAccountId, "account-2");
  assert.equal(event.details?.impersonatedDiscordId, "999999999999999");
});
