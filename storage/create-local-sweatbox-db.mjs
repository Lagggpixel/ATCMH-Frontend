import {closeSync, openSync, unlinkSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';

// Disposable ATCMH schema for local rehearsals. Production imports use import-simulator.mjs.
export function createLocalSweatboxDb(path) {
  closeSync(openSync(path, 'wx', 0o600));
  try {
    const db = new DatabaseSync(path);
    try {
      db.exec(`BEGIN;
    CREATE TABLE simulator_storage_version(version INTEGER); INSERT INTO simulator_storage_version VALUES(1);
    CREATE TABLE simulator_sessions(id TEXT PRIMARY KEY, owner_id TEXT, owner_name TEXT, title TEXT, created_at INTEGER, updated_at INTEGER, tick_at INTEGER, content_revision INTEGER, snapshot TEXT, staff_seat TEXT, mentee_seat TEXT, position_state TEXT, scenario_runtime TEXT, assigned_mentee_id TEXT, assigned_mentee_name TEXT, assigned_at INTEGER, assigned_by TEXT, assigned_by_name TEXT);
    CREATE TABLE simulator_replays(id TEXT PRIMARY KEY, session_id TEXT, attempt_id TEXT UNIQUE, owner_id TEXT, owner_name TEXT, title TEXT, started_at INTEGER, ended_at INTEGER, status TEXT DEFAULT 'recording', duration REAL DEFAULT 0, sequence_no INTEGER DEFAULT 0, content_revision INTEGER, initial_state TEXT, last_state TEXT, participants TEXT, feedback TEXT, partial INTEGER);
    CREATE TABLE simulator_replay_frames(replay_id TEXT REFERENCES simulator_replays(id) ON DELETE CASCADE, sequence_no INTEGER, at_seconds REAL, delta TEXT, interpolate INTEGER, PRIMARY KEY(replay_id,sequence_no));
    CREATE TABLE simulator_replay_chunks(replay_id TEXT NOT NULL REFERENCES simulator_replays(id) ON DELETE CASCADE, chunk_no INTEGER NOT NULL, first_sequence INTEGER NOT NULL, last_sequence INTEGER NOT NULL, frame_count INTEGER NOT NULL, sealed INTEGER NOT NULL DEFAULT 0, identities TEXT NOT NULL, created_at INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY(replay_id,chunk_no));
    CREATE TABLE simulator_replay_position_feedback(replay_id TEXT, position_id TEXT, feedback TEXT, PRIMARY KEY(replay_id,position_id));
    CREATE TABLE simulator_staff_preferences(account_id TEXT PRIMARY KEY, auto_readback INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE simulator_assignments(id TEXT PRIMARY KEY, owner_id TEXT, owner_name TEXT, learner_id TEXT, scenario_id TEXT, revision INTEGER, due_at INTEGER, max_attempts INTEGER, created_at INTEGER);
    CREATE TABLE simulator_scenarios(id TEXT PRIMARY KEY, owner_id TEXT, owner_name TEXT, version INTEGER, published_revision INTEGER, updated_at INTEGER, draft TEXT);
    CREATE TABLE simulator_scenario_revisions(scenario_id TEXT, revision INTEGER, created_at INTEGER, definition TEXT, PRIMARY KEY(scenario_id,revision));
    CREATE TABLE simulator_attempts(id TEXT PRIMARY KEY, assignment_id TEXT, owner_id TEXT, learner_id TEXT, scenario_id TEXT, revision INTEGER, session_id TEXT, started_at INTEGER, finished_at INTEGER, status TEXT, feedback TEXT, elapsed REAL DEFAULT 0, result TEXT);
    COMMIT;`);
    } finally {db.close();}
  } catch (error) {
    unlinkSync(path);
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('Pass a new path for the disposable SQLite database.');
  const path = resolve(process.argv[2]);
  createLocalSweatboxDb(path);
  console.log(path);
}
