-- Apply before running a release containing controller positions.
USE atcmh_lms;
ALTER TABLE simulator_sessions ADD COLUMN IF NOT EXISTS position_state LONGTEXT NULL;
