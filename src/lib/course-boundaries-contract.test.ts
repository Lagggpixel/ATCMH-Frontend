import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

function source(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("private course pages use the verified learner identity before loading content", () => {
  const catalogue = source("../app/exams/(learner)/courses/page.tsx");
  const detail = source("../app/exams/(learner)/courses/[courseId]/page.tsx");
  assert.match(catalogue, /getVerifiedLearnerIdentity\(\)/);
  assert.match(catalogue, /listPublishedCourses\(identity\.discordId\)/);
  assert.match(detail, /getVerifiedLearnerIdentity\(\)/);
  assert.match(detail, /getCourseForLearner\(courseId, identity\.discordId\)/);
  assert.doesNotMatch(detail, /searchParams.*(?:discord|userId|staff|admin)/i);
});

test("course progress and media routes keep learner mutations and reads private", () => {
  const completion = source("../app/exams/api/courses/[courseId]/sections/[sectionId]/complete/route.ts");
  const media = source("../app/exams/api/courses/media/[mediaId]/route.ts");
  assert.match(completion, /authorizeLearnerMutation\(/);
  assert.match(completion, /authorized\.session\.discordId/);
  assert.match(media, /getVerifiedLearnerDiscordSubject\(\)/);
  assert.match(media, /getCourseMediaForLearner\(/);
});

test("staff previews use a separate management media boundary", () => {
  const preview = source("../dashboard/components/admin/CoursePreview.tsx");
  const mediaRoute = source("../app/exams/api/management/courses/[courseId]/media/[mediaId]/route.ts");
  const repository = source("./course-repository.ts");
  assert.match(preview, /course-preview|Moderator preview/);
  assert.match(preview, /api\/management\/courses/);
  assert.match(mediaRoute, /requireManagementCapability\(request, "manage-courses"\)/);
  assert.match(mediaRoute, /getCourseMediaForManager\(/);
  assert.doesNotMatch(mediaRoute, /getCourseMediaForLearner/);
  assert.doesNotMatch(preview, /recordCourseAccess|CourseSectionCompletionButton|course_progress/);
  assert.match(repository, /export async function getCourseMediaForManager/);
});

test("dashboard course editing has dedicated routes and a management capability", () => {
  const routeMap = source("../dashboard/route-map.ts");
  const center = source("../dashboard/components/admin/ExamCenter.tsx");
  const courseCenter = source("../dashboard/components/admin/CourseCenter.tsx");
  const service = source("./course-management-service.ts");
  assert.match(routeMap, /view: "courses"/);
  assert.match(routeMap, /view: "course-create"/);
  assert.match(routeMap, /view: "course-edit"/);
  assert.match(routeMap, /view: "course-preview"/);
  assert.match(routeMap, /view: "course-stats"/);
  assert.match(center, /hasCapability\(data\.actor, "manage-courses"\)/);
  assert.match(courseCenter, /CourseStatistics/);
  assert.match(courseCenter, /CoursePreview/);
  assert.match(service, /assertManagementCapability\(actor, "manage-courses"\)/);
  assert.match(service, /assertManagementWritesEnabled\(\)/);
  assert.match(service, /course_quiz_links/);
  assert.match(service, /pass_percentage/);
});

test("course statistics remain behind the course-management API capability", () => {
  const route = source("../app/exams/api/management/courses/[courseId]/statistics/route.ts");
  assert.match(route, /requireManagementCapability\(request, "manage-courses"\)/);
  assert.match(route, /getCourseStatistics\(/);
});
