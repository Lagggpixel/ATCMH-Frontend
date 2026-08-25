-- Private, markdown-authored courses for authenticated Exams learners.
-- Apply this migration before setting EXAMS_MANAGEMENT_WRITES_ENABLED=true.

CREATE TABLE IF NOT EXISTS `courses` (
  `id` CHAR(36) NOT NULL,
  `slug` VARCHAR(200) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `description` VARCHAR(2000) NOT NULL,
  `is_published` BOOLEAN NOT NULL DEFAULT FALSE,
  `created_at` DATETIME(3) NOT NULL,
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_courses_slug` (`slug`),
  KEY `idx_courses_published_title` (`is_published`, `title`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `course_sections` (
  `id` CHAR(36) NOT NULL,
  `course_id` CHAR(36) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `sort_order` INT NOT NULL,
  `markdown_content` MEDIUMTEXT NOT NULL,
  `created_at` DATETIME(3) NOT NULL,
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_course_sections_order` (`course_id`, `sort_order`),
  KEY `idx_course_sections_course` (`course_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `course_progress` (
  `course_id` CHAR(36) NOT NULL,
  `section_id` CHAR(36) NOT NULL,
  `user_id` VARCHAR(20) NOT NULL,
  `completed_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`course_id`, `section_id`, `user_id`),
  KEY `idx_course_progress_user` (`user_id`, `course_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `course_media` (
  `id` CHAR(36) NOT NULL,
  `course_id` CHAR(36) NOT NULL,
  `filename` VARCHAR(255) NOT NULL,
  `content_type` VARCHAR(100) NOT NULL,
  `size_bytes` BIGINT UNSIGNED NOT NULL,
  `sha256` CHAR(64) NOT NULL,
  `content` LONGBLOB NOT NULL,
  `created_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_course_media_course` (`course_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
