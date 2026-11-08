USE atcmh_lms;
-- Compact binary replay frames. Additive: older images ignore this table and keep writing JSON frames.
-- SQLite deployments add the same table with `node maintenance/src/simulator/maintenance.js --install-compact-replays`.
-- Existing JSON frames are converted later by `--compact-replays` and deleted only after the soak period.
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
  CONSTRAINT replay_chunks_recording FOREIGN KEY (replay_id) REFERENCES simulator_replays(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
