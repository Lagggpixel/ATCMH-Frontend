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
  PRIMARY KEY (replay_id, sequence_no)
);
CREATE INDEX IF NOT EXISTS simulator_endless_replay_time ON simulator_endless_replay_index (replay_id, at_seconds, sequence_no);
