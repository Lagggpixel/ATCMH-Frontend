import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {recordReplay} from "./server/replay-store";
import {CHUNK_FRAMES, decodeChunks, readCompactFrames, resetCompactReplayDetection, SQLITE_CHUNKS_TABLE, type ChunkRow} from "./server/replay-chunks";
import {compactStoredReplays, deleteCompactedJsonFrames} from "./server/replay-compaction";
import {engineFor, initialExercise} from "./engine";
import {applyReplayDelta, replayState, type ReplayDelta} from "./replays";
import type {Exercise} from "./model";
import type {SessionRecord} from "./server/session-service";

function database(compact: boolean) {
  const db = new DatabaseSync(":memory:");
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE simulator_replays(id TEXT PRIMARY KEY, session_id TEXT, attempt_id TEXT UNIQUE, owner_id TEXT, owner_name TEXT, title TEXT, started_at INTEGER, ended_at INTEGER, status TEXT DEFAULT 'recording', duration REAL DEFAULT 0, sequence_no INTEGER DEFAULT 0, content_revision INTEGER, initial_state TEXT, last_state TEXT, participants TEXT, feedback TEXT, partial INTEGER);
    CREATE TABLE simulator_replay_frames(replay_id TEXT REFERENCES simulator_replays(id) ON DELETE CASCADE, sequence_no INTEGER, at_seconds REAL, delta TEXT, interpolate INTEGER, PRIMARY KEY(replay_id,sequence_no));
    ${compact ? SQLITE_CHUNKS_TABLE + ";" : ""}`);
  const connection = {execute: async (sql: string, values: (string | number | null | Uint8Array)[]) => {
    const statement = db.prepare(sql.replace(/\s+FOR UPDATE\b/gi, ""));
    return [statement.columns().length ? statement.all(...values) : statement.run(...values), []] as [unknown, unknown];
  }};
  return {db, connection};
}
const record = (exercise: Exercise, contentRevision: number, accountId = "c".repeat(32)): SessionRecord => ({id: "session", ownerId: accountId, title: "T", createdAt: 0, updatedAt: exercise.elapsed * 1000, tickAt: 0, contentRevision, exercise,
  staff: {accountId, token: "t", expiresAt: 1, displayName: "Trainer"}, mentee: null} as unknown as SessionRecord);

/** Decoded states follow the recorded states within the replay precision. */
function follows(initial: Exercise, frames: {delta: ReplayDelta}[], states: Exercise[]) {
  let state = initial;
  frames.forEach((frame, i) => {
    state = applyReplayDelta(state, frame.delta);
    const expected = states[i + 1];
    assert.deepEqual(state.messages, JSON.parse(JSON.stringify(expected.messages)), `messages at frame ${i + 1}`);
    assert.deepEqual(state.aircraft.map(a => a.id), expected.aircraft.map(a => a.id));
    state.aircraft.forEach((a, n) => {
      const b = expected.aircraft[n];
      assert.ok(Math.abs(a.position.x - b.position.x) <= .0005 + 1e-9 && Math.abs(a.position.y - b.position.y) <= .0005 + 1e-9 && Math.abs(a.altitude - b.altitude) <= .5 + 1e-9 && Math.abs(a.heading - b.heading) <= .05 + 1e-9, `aircraft ${a.id} at frame ${i + 1}`);
    });
  });
}
async function recordSession(connection: Parameters<typeof recordReplay>[0], seconds: number) {
  let state: Exercise = {...initialExercise("rec"), running: true};
  const engine = engineFor(state), states = [replayState(state)];
  let previous = record(state, 1);
  await recordReplay(connection, previous);
  for (let i = 1; i <= seconds; i++) {
    state = {...engine.advance(state, 1), elapsed: i};
    if (i % 10 === 0) state = {...state, messages: [...state.messages, {id: `m${i}`, aircraftId: state.aircraft[0].id, time: i * 1000, frequency: "tower", sender: "controller", text: `Message ${i}`}], demonstration: {startedAt: i * 1000, by: "Trainer", byId: "c".repeat(32)}} as Exercise;
    const next = record(state, i % 10 === 0 ? i : previous.contentRevision);
    await recordReplay(connection, next, previous, i === seconds ? "finished" : undefined);
    states.push(replayState(state)); previous = next;
  }
  return states;
}

test("new recordings store minute chunks that reproduce every frame", async () => {
  resetCompactReplayDetection();
  const {db, connection} = database(true);
  const states = await recordSession(connection, 130);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM simulator_replay_frames").get() as {n: number}).n, 0, "no JSON frames");
  const chunks = db.prepare("SELECT * FROM simulator_replay_chunks ORDER BY chunk_no").all() as ChunkRow[];
  assert.deepEqual(chunks.map(c => [Number(c.frame_count), Number(c.sealed)]), [[CHUNK_FRAMES, 1], [CHUNK_FRAMES, 1], [10, 1]], "the finished recording seals its last chunk");
  assert.ok(JSON.parse(chunks[0].identities).includes("c".repeat(32)), "account IDs are indexed for erasure");
  const replay = db.prepare("SELECT * FROM simulator_replays").get() as {initial_state: string; sequence_no: number; status: string};
  assert.equal(replay.status, "finished"); assert.equal(Number(replay.sequence_no), 130);
  const frames = decodeChunks(chunks, JSON.parse(replay.initial_state))!;
  assert.equal(frames.length, 130);
  follows(JSON.parse(replay.initial_state), frames, states);
  const json = frames.reduce((n, f) => n + JSON.stringify(f.delta).length, 0), stored = chunks.reduce((n, c) => n + (c.data as Uint8Array).length, 0);
  assert.ok(stored * 10 < json, `stored ${stored} bytes for ${json} bytes of JSON`);
  db.close();
});

test("older JSON recordings keep their format, then convert, verify and lose their JSON copy after the soak", async () => {
  resetCompactReplayDetection();
  const {db, connection} = database(false);
  const states = await recordSession(connection, 70);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM simulator_replay_frames").get() as {n: number}).n, 70);
  db.exec(SQLITE_CHUNKS_TABLE); resetCompactReplayDetection();
  const now = Date.now();
  const dry = await compactStoredReplays(connection, now);
  assert.equal(dry.replays, 1); assert.equal(dry.failed.length, 0);
  assert.ok(dry.compactBytes * 10 < dry.jsonBytes, JSON.stringify(dry));
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM simulator_replay_chunks").get() as {n: number}).n, 0, "a dry run writes nothing");
  assert.equal((await compactStoredReplays(connection, now, true)).replays, 1);
  assert.equal((await compactStoredReplays(connection, now, true)).replays, 0, "resumable: converted replays are skipped");
  const replay = db.prepare("SELECT * FROM simulator_replays").get() as {initial_state: string};
  const frames = decodeChunks(db.prepare("SELECT * FROM simulator_replay_chunks").all() as ChunkRow[], JSON.parse(replay.initial_state))!;
  follows(JSON.parse(replay.initial_state), frames, states);
  assert.equal((await deleteCompactedJsonFrames(connection, now + 86_400_000, true)).replays, 0, "JSON frames stay through the soak");
  const removed = await deleteCompactedJsonFrames(connection, now + 15 * 86_400_000, true);
  assert.equal(removed.replays, 1); assert.equal(removed.frames, 70);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM simulator_replay_frames").get() as {n: number}).n, 0);
  db.close();
});

test("a failed chunk write leaves no partial compact copy, and a retry converts the replay", async () => {
  resetCompactReplayDetection();
  const {db, connection} = database(false);
  const states = await recordSession(connection, CHUNK_FRAMES + 1);
  db.exec(SQLITE_CHUNKS_TABLE); resetCompactReplayDetection();
  let inserts = 0;
  const failing = {execute: async (sql: string, values: (string | number | null | Uint8Array)[]) => {
    if (/INSERT INTO simulator_replay_chunks/i.test(sql) && ++inserts === 2) throw new Error("disk full");
    return connection.execute(sql, values);
  }};
  // The maintenance runner wraps each task in one transaction and rolls it back when the task throws.
  db.exec("BEGIN");
  await assert.rejects(compactStoredReplays(failing, Date.now(), true), /Writing compact replay/);
  db.exec("ROLLBACK");
  assert.equal(inserts, 2, "the first chunk was written before the failure");
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM simulator_replay_chunks").get() as {n: number}).n, 0, "no partial copy survives");
  db.exec("BEGIN");
  const retry = await compactStoredReplays(connection, Date.now(), true);
  db.exec("COMMIT");
  assert.equal(retry.replays, 1); assert.equal(retry.failed.length, 0);
  const replay = db.prepare("SELECT * FROM simulator_replays").get() as {initial_state: string};
  const chunks = db.prepare("SELECT * FROM simulator_replay_chunks ORDER BY chunk_no").all() as ChunkRow[];
  assert.equal(chunks.length, 2);
  const frames = decodeChunks(chunks, JSON.parse(replay.initial_state))!;
  assert.equal(frames.length, CHUNK_FRAMES + 1);
  follows(JSON.parse(replay.initial_state), frames, states);
  db.close();
});

test("a recording an older JSON-only image continued during a rollback keeps every frame after re-upgrade", async () => {
  resetCompactReplayDetection();
  const {db, connection} = database(true);
  // The older image has no compact storage: its writer only ever inserts JSON frames.
  const legacy = {execute: async (sql: string, values: (string | number | null | Uint8Array)[]) => {
    if (/simulator_replay_chunks/i.test(sql)) throw new Error("no such table: simulator_replay_chunks");
    return connection.execute(sql, values);
  }};
  let state: Exercise = {...initialExercise("rec"), running: true};
  const engine = engineFor(state), states = [replayState(state)];
  let previous = record(state, 1);
  await recordReplay(connection, previous);
  const step = async (writer: typeof connection, i: number, last: boolean) => {
    state = {...engine.advance(state, 1), elapsed: i};
    const next = record(state, previous.contentRevision);
    await recordReplay(writer, next, previous, last ? "finished" : undefined);
    states.push(replayState(state)); previous = next;
  };
  for (let i = 1; i <= 5; i++) await step(connection, i, false);
  resetCompactReplayDetection();
  for (let i = 6; i <= 8; i++) await step(legacy, i, false);
  resetCompactReplayDetection();
  for (let i = 9; i <= CHUNK_FRAMES + 20; i++) await step(connection, i, i === CHUNK_FRAMES + 20);
  const query = async (sql: string, values: (string | number)[]) => db.prepare(sql).all(...values);
  const replay = db.prepare("SELECT * FROM simulator_replays").get() as {id: string; initial_state: string; sequence_no: number};
  const frames = (await readCompactFrames(query, replay.id, JSON.parse(replay.initial_state)))!;
  assert.deepEqual(frames.map(f => f.sequence), Array.from({length: CHUNK_FRAMES + 20}, (_, i) => i + 1), "no frame is skipped");
  assert.equal(replay.sequence_no, CHUNK_FRAMES + 20);
  follows(JSON.parse(replay.initial_state), frames, states);
  // The JSON frames from the rollback stay until the soak, then go once the compact copy is checked.
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM simulator_replay_frames").get() as {n: number}).n, 3);
  assert.equal((await compactStoredReplays(connection, Date.now(), true)).replays, 0, "already reconciled");
  const removed = await deleteCompactedJsonFrames(connection, Date.now() + 15 * 86_400_000, true);
  assert.equal(removed.replays, 1); assert.equal(removed.failed.length, 0);
  follows(JSON.parse(replay.initial_state), (await readCompactFrames(query, replay.id, JSON.parse(replay.initial_state)))!, states);
  db.close();
});

test("a recording an older image finished during a rollback reads its JSON tail, and maintenance folds it in", async () => {
  resetCompactReplayDetection();
  const {db, connection} = database(true);
  const legacy = {execute: async (sql: string, values: (string | number | null | Uint8Array)[]) => {
    if (/simulator_replay_chunks/i.test(sql)) throw new Error("no such table: simulator_replay_chunks");
    return connection.execute(sql, values);
  }};
  let state: Exercise = {...initialExercise("rec"), running: true};
  const engine = engineFor(state), states = [replayState(state)];
  let previous = record(state, 1);
  await recordReplay(connection, previous);
  for (let i = 1; i <= 10; i++) {
    if (i === 6) resetCompactReplayDetection();
    state = {...engine.advance(state, 1), elapsed: i};
    const next = record(state, 1);
    await recordReplay(i > 5 ? legacy : connection, next, previous, i === 10 ? "finished" : undefined);
    states.push(replayState(state)); previous = next;
  }
  resetCompactReplayDetection();
  const query = async (sql: string, values: (string | number)[]) => db.prepare(sql).all(...values);
  const replay = db.prepare("SELECT * FROM simulator_replays").get() as {id: string; initial_state: string};
  const initial = JSON.parse(replay.initial_state) as Exercise;
  const read = (await readCompactFrames(query, replay.id, initial))!;
  assert.deepEqual(read.map(f => f.sequence), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  follows(initial, read, states);
  const converted = await compactStoredReplays(connection, Date.now(), true);
  assert.equal(converted.replays, 1); assert.equal(converted.failed.length, 0);
  const chunks = db.prepare("SELECT * FROM simulator_replay_chunks ORDER BY chunk_no").all() as ChunkRow[];
  assert.deepEqual(decodeChunks(chunks, initial)!.map(f => f.sequence), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], "the compact copy now holds every frame");
  assert.equal((await compactStoredReplays(connection, Date.now(), true)).replays, 0, "resumable");
  db.close();
});
