import assert from "node:assert/strict";
import test from "node:test";

import { resolveDashboardRoute } from "./dashboard/route-map";

test("canonical Dashboard paths resolve to preserved screens", () => {
  assert.deepEqual(resolveDashboardRoute("/dashboard"), { screen: "redirect", destination: "/dashboard/mentees" });
  assert.deepEqual(resolveDashboardRoute("/dashboard/mentees"), { screen: "mentees" });
  assert.deepEqual(resolveDashboardRoute("/dashboard/mentees/42"), { screen: "mentees", params: { menteeRecordId: "42" } });
  assert.deepEqual(resolveDashboardRoute("/dashboard/exams/quiz-id/edit"), { screen: "exams", view: "edit", params: { examId: "quiz-id" } });
  assert.deepEqual(resolveDashboardRoute("/dashboard/exams/attempts/attempt-id"), { screen: "exams", view: "attempt-review", params: { attemptId: "attempt-id" } });
  assert.deepEqual(resolveDashboardRoute("/dashboard/unknown"), { screen: "not-found" });
});
