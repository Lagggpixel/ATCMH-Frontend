-- Apply to atcmh_lms before deploying replay recording. No automatic expiry.
USE atcmh_lms;
CREATE TABLE IF NOT EXISTS simulator_replays (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  session_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  attempt_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  owner_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  owner_name VARCHAR(128) NULL,
  title VARCHAR(80) NOT NULL,
  started_at BIGINT NOT NULL,
  ended_at BIGINT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'recording',
  duration DOUBLE NOT NULL DEFAULT 0,
  sequence_no BIGINT NOT NULL DEFAULT 0,
  content_revision BIGINT NOT NULL,
  initial_state LONGTEXT NOT NULL,
  last_state LONGTEXT NOT NULL,
  participants LONGTEXT NOT NULL,
  feedback TEXT NULL,
  partial BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE KEY replay_attempt (attempt_id),
  KEY replay_session (session_id, started_at),
  KEY replay_library (ended_at, id)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS simulator_replay_frames (
  replay_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  sequence_no BIGINT NOT NULL,
  at_seconds DOUBLE NOT NULL,
  delta LONGTEXT NOT NULL,
  interpolate BOOLEAN NOT NULL,
  PRIMARY KEY (replay_id, sequence_no),
  CONSTRAINT replay_frames_recording FOREIGN KEY (replay_id) REFERENCES simulator_replays(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
