import { randomUUID } from "node:crypto";

import type { DashboardAuditEvent } from "./dashboard-audit-client";
import type { Quiz } from "./exams-repository";
import type { ManagedCategory, QuizUnlockInput } from "./management-service";
import type { ManagementActor } from "./permissions";

function actorDetails(actor: ManagementActor): Record<string, string | boolean | null> {
  return {
    actorAccountId: actor.accountId ?? null,
    impersonating: actor.impersonating === true,
    ...(actor.impersonating ? {
      impersonatedAccountId: actor.impersonatedAccountId ?? null,
      impersonatedDiscordId: actor.impersonatedDiscordId ?? null,
    } : {}),
  };
}

function event(
  actor: ManagementActor,
  input: Omit<DashboardAuditEvent, "eventId" | "actorId"> & { eventId?: string },
): DashboardAuditEvent {
  return {
    eventId: input.eventId ?? randomUUID(),
    actorId: actor.discordId ?? actor.id,
    ...input,
    details: {...actorDetails(actor), ...input.details},
  };
}

export function quizSavedAuditEvent(quiz: Quiz, actor: ManagementActor, operation: "create" | "update"): DashboardAuditEvent {
  return event(actor, {
    action: `exam.quiz.${operation}`,
    targetType: "quiz",
    targetId: quiz.id,
    summary: operation === "create" ? `Created quiz: ${quiz.title}` : `Updated quiz: ${quiz.title}`,
    details: {
      title: quiz.title,
      categoryId: quiz.categoryId,
      category: quiz.category,
      isPrivate: quiz.isPrivate,
      questionCount: quiz.questions.length,
      tagCount: quiz.tags.length,
    },
  });
}

export function quizCategoryMovedAuditEvent(quiz: Quiz, actor: ManagementActor, previous?: Quiz): DashboardAuditEvent {
  return event(actor, {
    action: "exam.quiz.category.move",
    targetType: "quiz",
    targetId: quiz.id,
    summary: `Moved quiz to folder: ${quiz.title}`,
    details: {
      title: quiz.title,
      categoryId: quiz.categoryId,
      category: quiz.category,
      previousCategoryId: previous?.categoryId ?? null,
      previousCategory: previous?.category ?? null,
    },
  });
}

export function quizUnlockAuditEvent(input: QuizUnlockInput, actor: ManagementActor): DashboardAuditEvent {
  return event(actor, {
    action: input.unlocked ? "exam.quiz.unlock.grant" : "exam.quiz.unlock.revoke",
    targetType: "quiz",
    targetId: input.quizId,
    summary: input.unlocked ? "Granted learner access to a private quiz." : "Revoked learner access to a private quiz.",
    details: {learnerDiscordId: input.discordId, learnerName: input.userName?.trim() || null},
  });
}

export function quizCategoryCreatedAuditEvent(category: ManagedCategory, actor: ManagementActor): DashboardAuditEvent {
  return event(actor, {
    action: "exam.quiz.category.create",
    targetType: "quiz_category",
    targetId: category.id,
    summary: `Created quiz folder: ${category.name}`,
    details: {name: category.name, parentId: category.parentId},
  });
}

export function quizImportedAuditEvent(
  quizId: string,
  idempotencyKey: string,
  actor: ManagementActor,
): DashboardAuditEvent {
  return event(actor, {
    eventId: `exam-import:${idempotencyKey}`,
    action: "exam.quiz.import",
    targetType: "quiz",
    targetId: quizId,
    summary: "Imported a quiz.",
    details: {quizId},
  });
}
