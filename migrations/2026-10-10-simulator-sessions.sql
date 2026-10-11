-- Persistent shared exercises. No automatic expiry or cleanup of saved sessions.
CREATE TABLE IF NOT EXISTS atcmh_lms.simulator_sessions (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  owner_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  title VARCHAR(80) NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  tick_at BIGINT NOT NULL,
  content_revision BIGINT NOT NULL DEFAULT 0,
  snapshot LONGTEXT NOT NULL,
  staff_seat TEXT NULL,
  mentee_seat TEXT NULL,
  KEY simulator_owner_updated (owner_id, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
