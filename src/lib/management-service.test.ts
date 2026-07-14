import assert from "node:assert/strict";
import test from "node:test";

import { queryReadOnly, setPoolForTests, setWritePoolForTests } from "./db";
import { setReadOnlyQueryForTests } from "./exams-repository";
import { assertAdministrator, type ManagementActor } from "./permissions";
import { getManagedQuiz, moveManagedQuizCategory, saveManagedQuiz, setQuizUnlock } from "./management-service";

const mentorActor: ManagementActor = {
  discordId: "123456789012345",
  capabilities: ["manage-exams"],
  canManageAll: false,
};

const adminActor: ManagementActor = {
  discordId: "987654321098765",
  capabilities: ["manage-exams", "manage-system"],
  canManageAll: true,
};

const quizId = "c2a07cd2-3e2e-482e-b2ee-9d5c6fec6bc4";
const validQuiz = {
  title: "Tower fundamentals",
  description: "",
  category: "Tower",
  feedbackMode: "after_submission" as const,
  timeLimitSeconds: 0,
  tags: ["Fundamentals"],
  isPrivate: false,
  randomizeQuestions: false,
  questions: [{
    prompt: "Which frequency is used?",
    randomizeOptions: false,
    options: [{ text: "Tower", isCorrect: true }, { text: "Ground", isCorrect: false }],
  }],
};

function enableManagementWrites() {
  const previous = process.env.EXAMS_MANAGEMENT_WRITES_ENABLED;
  process.env.EXAMS_MANAGEMENT_WRITES_ENABLED = "true";
  return () => {
    if (previous === undefined) delete process.env.EXAMS_MANAGEMENT_WRITES_ENABLED;
    else process.env.EXAMS_MANAGEMENT_WRITES_ENABLED = previous;
    setPoolForTests(undefined);
    setWritePoolForTests(undefined);
    setReadOnlyQueryForTests(queryReadOnly);
  };
}

function writePool(executed: string[], selectRows: Array<Record<string, unknown>> = []) {
  const connection = {
    async query() { return [[]] as never; },
    async execute(sql: string) {
      executed.push(sql);
      return [sql.startsWith("SELECT") ? selectRows : []] as never;
    },
    async commit() {},
    async rollback() {},
    release() {},
  };
  return { getConnection: async () => connection } as never;
}

test("mentor may manage any quiz after Discord authorization", async () => {
  setReadOnlyQueryForTests(async () => [
    {
      id: "c2a07cd2-3e2e-482e-b2ee-9d5c6fec6bc4",
      title: "Tower fundamentals",
      description: "",
      category_id: "category-1",
      feedback_mode: "after_submission",
      time_limit_seconds: 0,
      randomize_questions: 0,
      is_private: 0,
    },
  ]);

  const quiz = await getManagedQuiz("c2a07cd2-3e2e-482e-b2ee-9d5c6fec6bc4", mentorActor);
  assert.equal(quiz?.title, "Tower fundamentals");
});

test("administrator may save global website content", async () => {
  assert.doesNotThrow(() => assertAdministrator(adminActor));
});

test("missing quiz update rejects before any mutation", async () => {
  const restore = enableManagementWrites();
  const executed: string[] = [];
  setPoolForTests({ execute: async () => [[{ id: "category-1" }]] } as never);
  setWritePoolForTests(writePool(executed));

  try {
    await assert.rejects(() => saveManagedQuiz({ ...validQuiz, id: quizId }, mentorActor), /Quiz not found/);
    assert.deepEqual(executed, ["SELECT id FROM quizzes WHERE id = ? FOR UPDATE"]);
  } finally {
    restore();
  }
});

test("missing quiz unlock rejects before any mutation", async () => {
  const restore = enableManagementWrites();
  const executed: string[] = [];
  setWritePoolForTests(writePool(executed));

  try {
    await assert.rejects(
      () => setQuizUnlock({ quizId, discordId: "123456789012345", unlocked: true }, {
        ...mentorActor,
        capabilities: ["unlock-learners"],
      }),
      /Quiz not found/,
    );
    assert.deepEqual(executed, ["SELECT id FROM quizzes WHERE id = ? FOR UPDATE"]);
  } finally {
    restore();
  }
});

test("administrator moves a quiz category without replacing quiz content", async () => {
  const restore = enableManagementWrites();
  const executed: string[] = [];
  setWritePoolForTests(writePool(executed, [{ id: quizId }, { id: "a447a1c6-0d75-4d09-93d9-1d902c7ed1df" }]));
  setReadOnlyQueryForTests(async () => [{
    id: quizId,
    title: validQuiz.title,
    description: validQuiz.description,
    category_id: "a447a1c6-0d75-4d09-93d9-1d902c7ed1df",
    category_name: "Ground",
    feedback_mode: validQuiz.feedbackMode,
    time_limit_seconds: validQuiz.timeLimitSeconds,
    randomize_questions: 0,
    is_private: 0,
  }]);

  try {
    await moveManagedQuizCategory(quizId, "a447a1c6-0d75-4d09-93d9-1d902c7ed1df", adminActor);
    assert.deepEqual(executed, [
      "SELECT id FROM quizzes WHERE id = ? FOR UPDATE",
      "SELECT id FROM categories WHERE id = ? FOR UPDATE",
      "UPDATE quizzes SET category_id = ?, updated_at = ? WHERE id = ?",
    ]);
  } finally {
    restore();
  }
});

test("duplicate tags produce only one tag join insert", async () => {
  const restore = enableManagementWrites();
  const executed: string[] = [];
  setPoolForTests({
    execute: async (sql: string) => {
      if (sql.includes("FROM categories")) return [[{ id: "category-1" }]];
      if (sql.includes("FROM tags")) return [[{ id: "tag-1" }]];
      if (sql.includes("FROM quizzes q") && sql.includes("WHERE q.id")) {
        return [[{
          id: quizId,
          title: validQuiz.title,
          description: validQuiz.description,
          category_id: "category-1",
          category_name: "Tower",
          feedback_mode: validQuiz.feedbackMode,
          time_limit_seconds: validQuiz.timeLimitSeconds,
          randomize_questions: 0,
          is_private: 1,
        }]];
      }
      return [[]];
    },
  } as never);
  setWritePoolForTests(writePool(executed));
  setReadOnlyQueryForTests(queryReadOnly);

  try {
    await saveManagedQuiz({ ...validQuiz, tags: ["Fundamentals", "Fundamentals"] }, mentorActor);
    assert.equal(executed.filter((sql) => sql.startsWith("INSERT INTO quiz_tags")).length, 1);
  } finally {
    restore();
  }
});
