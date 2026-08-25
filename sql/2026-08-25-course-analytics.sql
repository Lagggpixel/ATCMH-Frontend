-- Learner lifecycle and reporting data for private courses.
-- Apply after 2026-08-25-private-courses.sql and before enabling course writes.

CREATE TABLE IF NOT EXISTS `course_enrollments` (
  `course_id` CHAR(36) NOT NULL,
  `user_id` VARCHAR(20) NOT NULL,
  `status` VARCHAR(20) NOT NULL,
  `started_at` DATETIME(3) NOT NULL,
  `last_accessed_at` DATETIME(3) NOT NULL,
  `completed_at` DATETIME(3) NULL,
  `last_section_id` CHAR(36) NULL,
  PRIMARY KEY (`course_id`, `user_id`),
  KEY `idx_course_enrollments_status` (`course_id`, `status`),
  KEY `idx_course_enrollments_activity` (`course_id`, `last_accessed_at`),
  KEY `idx_course_enrollments_user` (`user_id`, `course_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `course_activity_events` (
  `id` CHAR(36) NOT NULL,
  `course_id` CHAR(36) NOT NULL,
  `section_id` CHAR(36) NULL,
  `user_id` VARCHAR(20) NOT NULL,
  `event_type` VARCHAR(32) NOT NULL,
  `event_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_course_activity_course_time` (`course_id`, `event_at`),
  KEY `idx_course_activity_user_time` (`user_id`, `event_at`),
  KEY `idx_course_activity_type` (`course_id`, `event_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `course_quiz_links` (
  `course_id` CHAR(36) NOT NULL,
  `section_id` CHAR(36) NOT NULL,
  `quiz_id` CHAR(36) NOT NULL,
  `reference_order` INT NOT NULL,
  `is_required` BOOLEAN NOT NULL DEFAULT FALSE,
  `pass_percentage` TINYINT UNSIGNED NULL,
  PRIMARY KEY (`section_id`, `reference_order`),
  KEY `idx_course_quiz_links_course` (`course_id`, `section_id`, `reference_order`),
  KEY `idx_course_quiz_links_quiz` (`quiz_id`, `course_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `course_quiz_attempts` (
  `id` CHAR(36) NOT NULL,
  `course_id` CHAR(36) NOT NULL,
  `quiz_id` CHAR(36) NOT NULL,
  `attempt_id` CHAR(36) NOT NULL,
  `user_id` VARCHAR(20) NOT NULL,
  `percentage` TINYINT UNSIGNED NOT NULL,
  `submitted_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_course_quiz_attempts_attempt` (`attempt_id`),
  KEY `idx_course_quiz_attempts_course_quiz` (`course_id`, `quiz_id`),
  KEY `idx_course_quiz_attempts_course_user` (`course_id`, `user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
