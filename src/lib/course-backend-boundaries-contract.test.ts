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

test("course catalogue and reader remain gated to verified learners", () => {
  const catalogue = source("../app/exams/(learner)/courses/page.tsx");
  const detail = source("../app/exams/(learner)/courses/[courseId]/page.tsx");
  assert.match(catalogue, /getVerifiedLearnerIdentity\(\)/);
  assert.match(catalogue, /identity \? await listPublishedCourses\(\)/);
  assert.match(catalogue, /Sign in to view courses/);
  assert.match(detail, /getVerifiedLearnerIdentity\(\)/);
  assert.match(detail, /Sign in to open this course/);
  assert.match(detail, /<CourseViewTracker courseId=\{course\.id\}\/>/);
});

test("course view telemetry carries CSRF, session identity, visibility heartbeats, and section context", () => {
  const tracker = source("../app/exams/(learner)/courses/CourseViewTracker.tsx");
  const api = source("../dashboard/utils/ExamsApiUtils.ts");
  const detail = source("../app/exams/(learner)/courses/[courseId]/page.tsx");
  assert.match(tracker, /getExistingSession\(\)/);
  assert.match(tracker, /recordCourseView/);
  assert.match(tracker, /visibilitychange/);
  assert.match(tracker, /heartbeat/);
  assert.match(tracker, /pagehide/);
  assert.match(tracker, /data-course-section-id/);
  assert.match(api, /\/courses\/\$\{encodeURIComponent\(courseId\)\}\/view-events/);
  assert.match(source("../dashboard/components/admin/CourseStatistics.tsx"), /Activity pass rate/);
  assert.match(source("../dashboard/components/admin/CourseStatistics.tsx"), /activityPassRate/);
  assert.match(detail, /data-course-section-id=\{section\.id\}/);
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
