import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {sqlSessionStore} from './server/session-store';
import {initialExercise} from './engine';
import {closeSimulatorStorage, queryReadOnly} from '../lib/simulator-db';

test('SQLite session updates serialize, rollback with replay changes, and survive reopening', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'sqlite-session-'));
  const path = join(directory, 'simulator.sqlite');
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE simulator_storage_version(version INTEGER); INSERT INTO simulator_storage_version VALUES(1);
    CREATE TABLE simulator_sessions(id TEXT PRIMARY KEY, owner_id TEXT, owner_name TEXT, title TEXT, created_at INTEGER, updated_at INTEGER, tick_at INTEGER, content_revision INTEGER, snapshot TEXT, staff_seat TEXT, mentee_seat TEXT, position_state TEXT, scenario_runtime TEXT, assigned_trainee_id TEXT, assigned_trainee_name TEXT, assigned_mentee_id TEXT, assigned_mentee_name TEXT, assigned_at INTEGER, assigned_by TEXT, assigned_by_name TEXT);
    CREATE TABLE simulator_replays(id TEXT PRIMARY KEY, session_id TEXT, attempt_id TEXT UNIQUE, owner_id TEXT, owner_name TEXT, title TEXT, started_at INTEGER, ended_at INTEGER, status TEXT DEFAULT 'recording', duration REAL DEFAULT 0, sequence_no INTEGER DEFAULT 0, content_revision INTEGER, initial_state TEXT, last_state TEXT, participants TEXT, feedback TEXT, partial INTEGER);
    CREATE TABLE simulator_replay_frames(replay_id TEXT REFERENCES simulator_replays(id) ON DELETE CASCADE, sequence_no INTEGER, at_seconds REAL, delta TEXT, interpolate INTEGER, PRIMARY KEY(replay_id,sequence_no));`);
  db.close();
  const previous = process.env.SIMULATOR_SQLITE_PATH;
  process.env.SIMULATOR_SQLITE_PATH = path;
  try {
    const id = randomUUID();
    await sqlSessionStore.create({id, ownerId: 'owner', title: 'SQLite regression', createdAt: 100, updatedAt: 100, tickAt: 100, contentRevision: 0, exercise: initialExercise(id), staff: null, mentee: null});
    await Promise.all(Array.from({length: 12}, () => sqlSessionStore.transaction(id, async record => {
      await new Promise(resolve => setTimeout(resolve, 1));
      record.updatedAt++;
    })));
    assert.equal((await sqlSessionStore.read(id)).updatedAt, 112);
    await assert.rejects(sqlSessionStore.transaction(id, record => {record.updatedAt = 999; record.exercise.elapsed = 50; throw new Error('abort transaction');}), /abort transaction/);
    assert.equal((await sqlSessionStore.read(id)).updatedAt, 112);
    await sqlSessionStore.transaction(id, record => {record.exercise.elapsed = 2; record.updatedAt = 200;});
    const frames = await queryReadOnly('SELECT sequence_no FROM simulator_replay_frames');
    assert.equal(frames.length, 1);
    await closeSimulatorStorage();
    const reloaded = await sqlSessionStore.read(id);
    assert.equal(reloaded.exercise.elapsed, 2);
    assert.equal(reloaded.updatedAt, 200);
  } finally {
    await closeSimulatorStorage();
    if (previous === undefined) delete process.env.SIMULATOR_SQLITE_PATH; else process.env.SIMULATOR_SQLITE_PATH = previous;
    rmSync(directory, {recursive: true});
  }
});
