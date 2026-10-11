-- Additive migration. Apply before enabling scenario authoring. Existing sessions remain unchanged.
USE atcmh_lms;
ALTER TABLE simulator_sessions ADD COLUMN IF NOT EXISTS scenario_runtime LONGTEXT NULL;
CREATE TABLE IF NOT EXISTS simulator_scenarios (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  owner_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  version INT NOT NULL DEFAULT 1, published_revision INT NOT NULL DEFAULT 0,
  updated_at BIGINT NOT NULL, draft LONGTEXT NOT NULL,
  INDEX scenario_owner (owner_id, updated_at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS simulator_scenario_revisions (
  scenario_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  revision INT NOT NULL, created_at BIGINT NOT NULL, definition LONGTEXT NOT NULL,
  PRIMARY KEY (scenario_id, revision)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS simulator_assignments (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  owner_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  learner_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  scenario_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  revision INT NOT NULL, due_at BIGINT NULL, max_attempts INT NOT NULL,
  created_at BIGINT NOT NULL,
  INDEX assignment_owner (owner_id, created_at), INDEX assignment_learner (learner_id, created_at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS simulator_attempts (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  assignment_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  owner_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  learner_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL,
  scenario_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  revision INT NOT NULL, session_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  started_at BIGINT NOT NULL, finished_at BIGINT NULL,
  status VARCHAR(16) NOT NULL, feedback TEXT NOT NULL, elapsed DOUBLE NOT NULL DEFAULT 0,
  result LONGTEXT NULL,
  INDEX attempt_assignment (assignment_id, started_at), INDEX attempt_session (session_id, status)
) ENGINE=InnoDB;
