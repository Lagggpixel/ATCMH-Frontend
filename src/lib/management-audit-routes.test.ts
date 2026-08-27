import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("successful quiz mutations emit Dashboard audit events after persistence", () => {
  const routes = [
    ["../app/exams/api/management/quizzes/route.ts", "await saveManagedQuiz", "await emitDashboardAuditEvent"],
    ["../app/exams/api/management/quizzes/[quizId]/route.ts", "await saveManagedQuiz", "await emitDashboardAuditEvent"],
    ["../app/exams/api/management/quizzes/[quizId]/category/route.ts", "await moveManagedQuizCategory", "await emitDashboardAuditEvent"],
    ["../app/exams/api/management/quizzes/[quizId]/unlocks/route.ts", "await setQuizUnlock", "await emitDashboardAuditEvent"],
    ["../app/exams/api/management/categories/route.ts", "await createManagedCategory", "await emitDashboardAuditEvent"],
    ["../app/exams/api/management/imports/commit/route.ts", "await commitPreviewedImport", "await emitDashboardAuditEvent"],
  ] as const;

  for (const [path, mutation, audit] of routes) {
    const route = source(path);
    assert.ok(route.indexOf(mutation) >= 0, `${path} should persist its mutation`);
    assert.ok(route.indexOf(audit) > route.indexOf(mutation), `${path} should audit only after persistence`);
  }
});

test("import preview does not emit a mutation audit", () => {
  assert.doesNotMatch(source("../app/exams/api/management/imports/preview/route.ts"), /emitDashboardAuditEvent/);
});
