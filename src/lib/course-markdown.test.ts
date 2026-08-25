import assert from "node:assert/strict";
import test from "node:test";

import {
  CourseMarkdownValidationError,
  courseMarkdownReferences,
  parseCourseMarkdown,
  validateCourseMarkdown,
} from "./course-markdown";

const quizId = "123e4567-e89b-42d3-a456-426614174000";
const mediaId = "223e4567-e89b-42d3-a456-426614174000";

test("course Markdown keeps quiz checkpoints in document order", () => {
  const blocks = parseCourseMarkdown(`# Welcome\n\nRead this first.\n\n{{quiz:${quizId} required pass:80}}\n\n- Keep going\n\n{{image:${mediaId}}}`);
  assert.deepEqual(blocks.map(block => block.type), ["heading", "paragraph", "quiz", "list", "media"]);
  assert.deepEqual(courseMarkdownReferences(`# Welcome\n\n{{quiz:${quizId} required pass:80}}\n\n{{quiz:${quizId}}}\n\n{{video:${mediaId}}}`), [
    {type: "quiz", quizId, required: true, passPercentage: 80},
    {type: "quiz", quizId, required: false},
    {type: "media", mediaId, kind: "video"},
  ]);
});

test("course Markdown rejects unknown executable-style directives", () => {
  assert.throws(() => validateCourseMarkdown("{{html:<script>alert(1)</script>}}"), CourseMarkdownValidationError);
  assert.throws(() => validateCourseMarkdown("{{quiz:not-a-uuid}}"), /Invalid course directive/);
  assert.throws(() => validateCourseMarkdown(""), /cannot be empty/);
});

test("optional quiz tokens do not become section gates", () => {
  validateCourseMarkdown(`{{quiz:${quizId}}}`);
  const [reference] = courseMarkdownReferences(`{{quiz:${quizId}}}`);
  assert.equal(reference.type, "quiz");
  if (reference.type === "quiz") assert.equal(reference.required, false);
});

test("passing scores require a required quiz and stay within percentage bounds", () => {
  validateCourseMarkdown(`{{quiz:${quizId} required pass:1}}`);
  validateCourseMarkdown(`{{quiz:${quizId} required pass:100}}`);
  assert.throws(() => validateCourseMarkdown(`{{quiz:${quizId} pass:80}}`), /only be set on a required quiz/);
  assert.throws(() => validateCourseMarkdown(`{{quiz:${quizId} required pass:0}}`), /between 1 and 100/);
});
