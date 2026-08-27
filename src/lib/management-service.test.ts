import assert from "node:assert/strict";
import test from "node:test";

import { queryReadOnly, setPoolForTests, setWritePoolForTests } from "./db";
import { setReadOnlyQueryForTests } from "./exams-repository";
import { assertAdministrator, type ManagementActor } from "./permissions";
import { getManagedQuiz, listManagedCategories, moveManagedQuizCategory, saveManagedQuiz, setQuizUnlock } from "./management-service";

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

function writePool(
  executed: string[],
  selectRows: Array<Record<string, unknown>> | ((sql: string, values: readonly unknown[]) => Array<Record<string, unknown>>) = [],
  executedValues: Array<readonly unknown[]> = [],
) {
  const connection = {
    async query() { return [[]] as never; },
    async execute(sql: string, values: readonly unknown[] = []) {
      executed.push(sql);
      executedValues.push(values);
      const rows = typeof selectRows === "function" ? selectRows(sql, values) : selectRows;
      return [sql.startsWith("SELECT") ? rows : []] as never;
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

test("quiz managers receive the complete canonical category list", async () => {
  const rows = Array.from({ length: 15 }, (_, index) => ({ id: `category-${index}`, name: `Folder ${index}`, parent_id: null }));
  setPoolForTests({ execute: async () => [rows] } as never);

  try {
    const categories = await listManagedCategories(mentorActor);
    assert.equal(categories.length, 15);
  } finally {
    setPoolForTests(undefined);
  }
});

test("missing quiz update rejects before any mutation", async () => {
  const restore = enableManagementWrites();
  const executed: string[] = [];
  setPoolForTests({ execute: async () => [[{ id: "category-1" }]] } as never);
  setWritePoolForTests(writePool(executed));

  try {
    await assert.rejects(() => saveManagedQuiz({ ...validQuiz, id: quizId }, mentorActor), /Quiz not found/);
    assert.deepEqual(executed, ["SELECT id, category_id FROM quizzes WHERE id = ? FOR UPDATE"]);
  } finally {
    restore();
  }
});

test("quiz managers cannot move an existing quiz through the general update path", async () => {
  const restore = enableManagementWrites();
  const executed: string[] = [];
  setWritePoolForTests(writePool(executed, (sql) => sql.startsWith("SELECT id, category_id FROM quizzes")
    ? [{id: quizId, category_id: "a447a1c6-0d75-4d09-93d9-1d902c7ed1df"}]
    : []));

  try {
    await assert.rejects(
      () => saveManagedQuiz({
        ...validQuiz,
        id: quizId,
        categoryId: "b558b2d7-1b4f-4e1a-81d8-2e913d8fe2ef",
      }, mentorActor),
      /administrator access is required to move a quiz/,
    );
    assert.deepEqual(executed, ["SELECT id, category_id FROM quizzes WHERE id = ? FOR UPDATE"]);
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
  setWritePoolForTests(writePool(executed, (sql) => {
      if (sql.includes("FROM categories")) return [{ id: "category-1" }];
      if (sql.includes("FROM tags")) return [{ id: "tag-1", name: "Fundamentals" }];
      if (sql.includes("FROM quizzes q") && sql.includes("WHERE q.id")) {
        return [{
          id: quizId,
          title: validQuiz.title,
          description: validQuiz.description,
          category_id: "category-1",
          category_name: "Tower",
          feedback_mode: validQuiz.feedbackMode,
          time_limit_seconds: validQuiz.timeLimitSeconds,
          randomize_questions: 0,
          is_private: 1,
        }];
      }
      if (sql.includes("FROM quiz_questions")) return [{ id: "question-1", prompt: validQuiz.questions[0].prompt, correct_option_id: "option-1", sort_order: 1, randomize_options: 0 }];
      if (sql.includes("FROM quiz_options")) return [
        { id: "option-1", question_id: "question-1", text: "Tower", sort_order: 1 },
        { id: "option-2", question_id: "question-1", text: "Ground", sort_order: 2 },
      ];
      return [];
  }));
  setReadOnlyQueryForTests(queryReadOnly);

  try {
    await saveManagedQuiz({ ...validQuiz, tags: ["Fundamentals", "Fundamentals"] }, mentorActor);
    assert.equal(executed.filter((sql) => sql.startsWith("INSERT INTO quiz_tags")).length, 1);
  } finally {
    restore();
  }
});

test("new public quizzes persist the requested visibility and read back on the write connection", async () => {
  const restore = enableManagementWrites();
  const executed: string[] = [];
  const values: Array<readonly unknown[]> = [];
  setWritePoolForTests(writePool(executed, (sql) => {
    if (sql.includes("FROM categories")) return [{ id: "category-1" }];
    if (sql.includes("FROM tags")) return [{ id: "tag-1", name: "Fundamentals" }];
    if (sql.includes("FROM quizzes q")) return [{
      id: quizId,
      title: validQuiz.title,
      description: validQuiz.description,
      category_id: "category-1",
      category_name: "Tower",
      feedback_mode: validQuiz.feedbackMode,
      time_limit_seconds: validQuiz.timeLimitSeconds,
      randomize_questions: 0,
      is_private: 0,
    }];
    if (sql.includes("FROM quiz_questions")) return [{ id: "question-1", prompt: validQuiz.questions[0].prompt, correct_option_id: "option-1", sort_order: 1, randomize_options: 0 }];
    if (sql.includes("FROM quiz_options")) return [
      { id: "option-1", question_id: "question-1", text: "Tower", sort_order: 1 },
      { id: "option-2", question_id: "question-1", text: "Ground", sort_order: 2 },
    ];
    return [];
  }, values));

  try {
    const saved = await saveManagedQuiz(validQuiz, mentorActor);
    const insertIndex = executed.findIndex(sql => sql.startsWith("INSERT INTO quizzes"));
    assert.ok(insertIndex >= 0);
    assert.equal(values[insertIndex].at(-1), false);
    assert.equal(saved.isPrivate, false);
    assert.equal(executed.some(sql => sql.includes("FROM quizzes q")), true);
  } finally {
    restore();
  }
});
