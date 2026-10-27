USE atcmh_lms;
CREATE TABLE IF NOT EXISTS simulator_notification_preferences (
  account_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  feedback_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  assignment_enabled BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS simulator_replay_position_feedback (
  replay_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  position_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  feedback TEXT NOT NULL,
  PRIMARY KEY (replay_id,position_id),
  FOREIGN KEY (replay_id) REFERENCES simulator_replays(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
