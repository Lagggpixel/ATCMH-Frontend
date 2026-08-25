import assert from "node:assert/strict";
import test from "node:test";

import { ATCMH_LMS_SCHEMA_CONTRACT } from "./atcmh-lms-schema-contract";

test("documents every live atcmh_lms column used by the read repository", () => {
  assert.deepEqual(ATCMH_LMS_SCHEMA_CONTRACT.quizzes, [
    "id", "title", "description", "category_id", "feedback_mode", "time_limit_seconds", "randomize_questions", "is_private",
  ]);
  assert.deepEqual(ATCMH_LMS_SCHEMA_CONTRACT.quiz_questions, [
    "id", "quiz_id", "prompt", "correct_option_id", "sort_order", "randomize_options",
  ]);
  assert.deepEqual(ATCMH_LMS_SCHEMA_CONTRACT.quiz_options, ["id", "question_id", "text", "sort_order"]);
  assert.deepEqual(ATCMH_LMS_SCHEMA_CONTRACT.quiz_tags, ["quiz_id", "tag_id"]);
  assert.deepEqual(ATCMH_LMS_SCHEMA_CONTRACT.tags, ["id", "name"]);
  assert.deepEqual(ATCMH_LMS_SCHEMA_CONTRACT.quiz_unlocks, ["quiz_id", "user_id", "unlocked_by", "unlocked_at", "user_name"]);
  assert.deepEqual(ATCMH_LMS_SCHEMA_CONTRACT.quiz_bank_draws, ["quiz_id", "question_bank_id", "question_count", "sort_order"]);
  assert.deepEqual(ATCMH_LMS_SCHEMA_CONTRACT.attempts, ["id", "code", "quiz_id", "student_name", "score", "total", "percentage", "submitted_at", "timed_out", "submission_reason", "question_snapshot"]);
  assert.deepEqual(ATCMH_LMS_SCHEMA_CONTRACT.attempt_answers, ["attempt_id", "question_id", "selected_option_id", "correct"]);
  assert.deepEqual(ATCMH_LMS_SCHEMA_CONTRACT.courses, ["id", "slug", "title", "description", "is_published", "created_at", "updated_at"]);
  assert.deepEqual(ATCMH_LMS_SCHEMA_CONTRACT.course_sections, ["id", "course_id", "title", "sort_order", "markdown_content", "created_at", "updated_at"]);
  assert.deepEqual(ATCMH_LMS_SCHEMA_CONTRACT.course_progress, ["course_id", "section_id", "user_id", "completed_at"]);
  assert.deepEqual(ATCMH_LMS_SCHEMA_CONTRACT.course_media, ["id", "course_id", "filename", "content_type", "size_bytes", "sha256", "content", "created_at"]);
  assert.deepEqual(ATCMH_LMS_SCHEMA_CONTRACT.course_enrollments, ["course_id", "user_id", "status", "started_at", "last_accessed_at", "completed_at", "last_section_id"]);
  assert.deepEqual(ATCMH_LMS_SCHEMA_CONTRACT.course_activity_events, ["id", "course_id", "section_id", "user_id", "event_type", "event_at"]);
  assert.deepEqual(ATCMH_LMS_SCHEMA_CONTRACT.course_quiz_links, ["course_id", "section_id", "quiz_id", "reference_order", "is_required", "pass_percentage"]);
  assert.deepEqual(ATCMH_LMS_SCHEMA_CONTRACT.course_quiz_attempts, ["id", "course_id", "quiz_id", "attempt_id", "user_id", "percentage", "submitted_at"]);
});
