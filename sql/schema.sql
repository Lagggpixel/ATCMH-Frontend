-- ATCMH simulator schema for MariaDB. The atcmh_lms database must already exist.
-- Run this file to initialize the tables or add missing columns and indexes.
USE atcmh_lms;

-- Sessions and staff preferences
CREATE TABLE IF NOT EXISTS simulator_sessions (
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
  scenario_runtime LONGTEXT NULL,
  owner_name VARCHAR(128) NULL,
  assigned_mentee_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL,
  assigned_mentee_name VARCHAR(128) NULL,
  assigned_at BIGINT NULL,
  assigned_by VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL,
  assigned_by_name VARCHAR(128) NULL,
  position_state LONGTEXT NULL,
  KEY simulator_owner_updated (owner_id, updated_at),
  KEY simulator_shared_updated (updated_at),
  KEY session_assigned_mentee (assigned_mentee_id, assigned_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS simulator_staff_preferences (
  account_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  auto_readback TINYINT(1) NOT NULL DEFAULT 0,
  updated_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS simulator_notification_preferences (
  account_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  feedback_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  assignment_enabled BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Scenarios and historical assignment and attempt records
CREATE TABLE IF NOT EXISTS simulator_scenarios (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  owner_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  version INT NOT NULL DEFAULT 1,
  published_revision INT NOT NULL DEFAULT 0,
  updated_at BIGINT NOT NULL,
  draft LONGTEXT NOT NULL,
  owner_name VARCHAR(128) NULL,
  KEY scenario_owner (owner_id, updated_at),
  KEY scenario_shared_updated (updated_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS simulator_scenario_revisions (
  scenario_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  revision INT NOT NULL,
  created_at BIGINT NOT NULL,
  definition LONGTEXT NOT NULL,
  PRIMARY KEY (scenario_id, revision)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS simulator_assignments (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  owner_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  learner_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  scenario_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  revision INT NOT NULL,
  due_at BIGINT NULL,
  max_attempts INT NOT NULL,
  created_at BIGINT NOT NULL,
  owner_name VARCHAR(128) NULL,
  KEY assignment_owner (owner_id, created_at),
  KEY assignment_learner (learner_id, created_at),
  KEY assignment_shared_created (created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS simulator_attempts (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  assignment_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  owner_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  learner_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL,
  scenario_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  revision INT NOT NULL,
  session_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  started_at BIGINT NOT NULL,
  finished_at BIGINT NULL,
  status VARCHAR(16) NOT NULL,
  feedback TEXT NOT NULL,
  elapsed DOUBLE NOT NULL DEFAULT 0,
  result LONGTEXT NULL,
  KEY attempt_assignment (assignment_id, started_at),
  KEY attempt_session (session_id, status)
) ENGINE=InnoDB;

-- Recordings are independent of live sessions. Deleting a recording cascades
-- to its frames, compact chunks and position feedback.
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS simulator_replay_frames (
  replay_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  sequence_no BIGINT NOT NULL,
  at_seconds DOUBLE NOT NULL,
  delta LONGTEXT NOT NULL,
  interpolate BOOLEAN NOT NULL,
  PRIMARY KEY (replay_id, sequence_no),
  CONSTRAINT replay_frames_recording FOREIGN KEY (replay_id) REFERENCES simulator_replays (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS simulator_replay_chunks (
  replay_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  chunk_no INT NOT NULL,
  first_sequence BIGINT NOT NULL,
  last_sequence BIGINT NOT NULL,
  frame_count INT NOT NULL,
  sealed BOOLEAN NOT NULL DEFAULT FALSE,
  identities TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  data LONGBLOB NOT NULL,
  PRIMARY KEY (replay_id, chunk_no),
  CONSTRAINT replay_chunks_recording FOREIGN KEY (replay_id) REFERENCES simulator_replays (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS simulator_replay_position_feedback (
  replay_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  position_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  feedback TEXT NOT NULL,
  PRIMARY KEY (replay_id, position_id),
  FOREIGN KEY (replay_id) REFERENCES simulator_replays (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Endless Practice
CREATE TABLE IF NOT EXISTS simulator_endless_scenarios (
  id VARCHAR(36) PRIMARY KEY,
  owner_id VARCHAR(256) NOT NULL,
  version INT NOT NULL,
  updated_at BIGINT NOT NULL,
  definition LONGTEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS simulator_endless_replay_index (
  replay_id VARCHAR(36) NOT NULL,
  sequence_no INT NOT NULL,
  at_seconds DOUBLE NOT NULL,
  snapshot LONGTEXT NOT NULL,
  PRIMARY KEY (replay_id, sequence_no),
  KEY simulator_endless_replay_time (replay_id, at_seconds, sequence_no)
);

-- Upgrade tables from earlier installations. CREATE TABLE IF NOT EXISTS leaves
-- their existing definitions intact.
ALTER TABLE simulator_sessions
  ADD COLUMN IF NOT EXISTS scenario_runtime LONGTEXT NULL,
  ADD COLUMN IF NOT EXISTS owner_name VARCHAR(128) NULL,
  ADD COLUMN IF NOT EXISTS assigned_mentee_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN IF NOT EXISTS assigned_mentee_name VARCHAR(128) NULL,
  ADD COLUMN IF NOT EXISTS assigned_at BIGINT NULL,
  ADD COLUMN IF NOT EXISTS assigned_by VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN IF NOT EXISTS assigned_by_name VARCHAR(128) NULL,
  ADD COLUMN IF NOT EXISTS position_state LONGTEXT NULL,
  ADD KEY IF NOT EXISTS simulator_shared_updated (updated_at),
  ADD KEY IF NOT EXISTS session_assigned_mentee (assigned_mentee_id, assigned_at);

ALTER TABLE simulator_scenarios
  ADD COLUMN IF NOT EXISTS owner_name VARCHAR(128) NULL,
  ADD KEY IF NOT EXISTS scenario_shared_updated (updated_at);

ALTER TABLE simulator_assignments
  ADD COLUMN IF NOT EXISTS owner_name VARCHAR(128) NULL,
  ADD KEY IF NOT EXISTS assignment_shared_created (created_at);

ALTER TABLE simulator_endless_replay_index
  ADD KEY IF NOT EXISTS simulator_endless_replay_time (replay_id, at_seconds, sequence_no);

-- Optional backfill for legacy rows with missing creator names. Run the block
-- manually after the schema upgrade when atcmh.atcmh_account_identities is
-- available. Discord names take precedence over the same account's active IFC
-- name. Both passes preserve any creator names already stored.
/*
UPDATE atcmh_lms.simulator_sessions s
JOIN atcmh.atcmh_account_identities i
  ON i.account_id = CAST(s.owner_id AS UNSIGNED) AND i.provider = 'discord'
SET s.owner_name = LEFT(i.display_name, 128)
WHERE s.owner_name IS NULL AND NULLIF(TRIM(i.display_name), '') IS NOT NULL;

UPDATE atcmh_lms.simulator_scenarios s
JOIN atcmh.atcmh_account_identities i
  ON i.account_id = CAST(s.owner_id AS UNSIGNED) AND i.provider = 'discord'
SET s.owner_name = LEFT(i.display_name, 128)
WHERE s.owner_name IS NULL AND NULLIF(TRIM(i.display_name), '') IS NOT NULL;

UPDATE atcmh_lms.simulator_assignments s
JOIN atcmh.atcmh_account_identities i
  ON i.account_id = CAST(s.owner_id AS UNSIGNED) AND i.provider = 'discord'
SET s.owner_name = LEFT(i.display_name, 128)
WHERE s.owner_name IS NULL AND NULLIF(TRIM(i.display_name), '') IS NOT NULL;

UPDATE atcmh_lms.simulator_sessions s
JOIN atcmh.atcmh_account_identities i
  ON i.account_id = CAST(s.owner_id AS UNSIGNED) AND i.provider = 'IFC'
  AND i.active_account_provider IS NOT NULL
SET s.owner_name = LEFT(i.display_name, 128)
WHERE s.owner_name IS NULL AND NULLIF(TRIM(i.display_name), '') IS NOT NULL;

UPDATE atcmh_lms.simulator_scenarios s
JOIN atcmh.atcmh_account_identities i
  ON i.account_id = CAST(s.owner_id AS UNSIGNED) AND i.provider = 'IFC'
  AND i.active_account_provider IS NOT NULL
SET s.owner_name = LEFT(i.display_name, 128)
WHERE s.owner_name IS NULL AND NULLIF(TRIM(i.display_name), '') IS NOT NULL;

UPDATE atcmh_lms.simulator_assignments s
JOIN atcmh.atcmh_account_identities i
  ON i.account_id = CAST(s.owner_id AS UNSIGNED) AND i.provider = 'IFC'
  AND i.active_account_provider IS NOT NULL
SET s.owner_name = LEFT(i.display_name, 128)
WHERE s.owner_name IS NULL AND NULLIF(TRIM(i.display_name), '') IS NOT NULL;
*/
