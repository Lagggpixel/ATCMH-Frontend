import assert from "node:assert/strict";
import {existsSync, readFileSync} from "node:fs";
import test from "node:test";

function source(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("course UI and learner quiz access use the Dashboard backend authority", () => {
  assert.match(source("./course-api-client.ts"), /dashboardApiUrl\(\).*courses|backendRequest\("\/courses/);
  assert.match(source("./exams-repository.ts"), /isPublishedCourseQuiz/);
  assert.match(source("../dashboard/utils/ExamsApiUtils.ts"), /\/admin\/courses/);
  assert.match(source("../app/exams/(learner)/courses/CourseSectionCompletionButton.tsx"), /ApiUtils\.apiOrigin/);
  assert.match(source("../dashboard/components/admin/CoursePreview.tsx"), /ApiUtils\.apiOrigin/);
});

test("course data and mutation ownership no longer has Next API route files", () => {
  for (const route of [
    "../app/exams/api/courses/[courseId]/sections/[sectionId]/complete/route.ts",
    "../app/exams/api/courses/media/[mediaId]/route.ts",
    "../app/exams/api/management/courses/route.ts",
    "../app/exams/api/management/courses/[courseId]/route.ts",
    "../app/exams/api/management/courses/[courseId]/statistics/route.ts",
    "../app/exams/api/management/courses/[courseId]/media/route.ts",
    "../app/exams/api/management/courses/[courseId]/media/[mediaId]/route.ts",
  ]) assert.equal(existsSync(new URL(route, import.meta.url)), false, route);
});
