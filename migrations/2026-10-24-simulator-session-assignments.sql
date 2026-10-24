-- Your sweatbox: a trainer can assign one Discord account as a session's mentee.
-- Additive and nullable. Apply BEFORE deploying the frontend that reads these columns;
-- existing sessions stay unassigned and keep today's access rules. Back up simulator_sessions first.
USE atcmh_lms;
ALTER TABLE simulator_sessions
  ADD COLUMN IF NOT EXISTS assigned_mentee_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN IF NOT EXISTS assigned_mentee_name VARCHAR(128) NULL,
  ADD COLUMN IF NOT EXISTS assigned_at BIGINT NULL,
  ADD COLUMN IF NOT EXISTS assigned_by VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN IF NOT EXISTS assigned_by_name VARCHAR(128) NULL,
  ADD INDEX IF NOT EXISTS session_assigned_mentee (assigned_mentee_id, assigned_at);
