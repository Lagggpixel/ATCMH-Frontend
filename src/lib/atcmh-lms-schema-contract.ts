/**
 * Read-only metadata snapshot checked against the production `atcmh_lms`
 * schema on 2026-07-10. Keep this in sync before changing repository SQL.
 */
export const ATCMH_LMS_SCHEMA_CONTRACT = {
  quizzes: ["id", "title", "description", "category_id", "feedback_mode", "time_limit_seconds", "randomize_questions", "is_private"],
  quiz_questions: ["id", "quiz_id", "prompt", "correct_option_id", "sort_order", "randomize_options"],
  quiz_options: ["id", "question_id", "text", "sort_order"],
  quiz_tags: ["quiz_id", "tag_id"],
  tags: ["id", "name"],
  quiz_unlocks: ["quiz_id", "user_id", "unlocked_by", "unlocked_at", "user_name"],
  quiz_bank_draws: ["quiz_id", "question_bank_id", "question_count", "sort_order"],
  attempts: ["id", "code", "quiz_id", "student_name", "score", "total", "percentage", "submitted_at", "timed_out", "submission_reason", "question_snapshot"],
  attempt_answers: ["attempt_id", "question_id", "selected_option_id", "correct"],
} as const;
