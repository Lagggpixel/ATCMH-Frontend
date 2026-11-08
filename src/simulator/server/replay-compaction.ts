import type {RowDataPacket} from "mysql2/promise";
import type {Exercise} from "../model";
import type {ReplayFrame} from "../replays";
import {buildCompactChunks, chunksReproduce, compactReplaysAvailable, framesReproduce, decodeChunks, SQLITE_CHUNKS_TABLE, writeCompactChunks, type ChunkConnection, type ChunkRow} from "./replay-chunks";

/** Maintenance only: converts finished JSON replays to compact chunks, then, after a soak, removes the JSON copies. */
export const COMPACT_SOAK_DAYS = 14;
const DAY = 86_400_000;
type Rows<T> = (RowDataPacket & T)[];
const rows = async <T>(connection: ChunkConnection, sql: string, values: (string | number)[]) => (await connection.execute(sql, values))[0] as Rows<T>;

export async function installCompactReplays(connection: ChunkConnection) {
  await connection.execute(SQLITE_CHUNKS_TABLE, []);
}
async function jsonFrames(connection: ChunkConnection, replayId: string): Promise<ReplayFrame[]> {
  const list = await rows<{sequence_no: number; at_seconds: number; delta: string; interpolate: number}>(connection, "SELECT sequence_no,at_seconds,delta,interpolate FROM simulator_replay_frames WHERE replay_id=? ORDER BY sequence_no", [replayId]);
  return list.map(f => ({sequence: Number(f.sequence_no), at: Number(f.at_seconds), delta: JSON.parse(f.delta), interpolate: !!f.interpolate}));
}
/** Resumable: each run converts up to `limit` finished replays that have no compact frames yet. Dry run writes nothing. */
export async function compactStoredReplays(connection: ChunkConnection, now: number, apply = false, limit = 25) {
  if (!await compactReplaysAvailable(connection)) throw new Error("Compact replay storage is not installed");
  const candidates = await rows<{id: string; initial_state: string}>(connection, `SELECT r.id,r.initial_state FROM simulator_replays r WHERE r.ended_at IS NOT NULL AND EXISTS (SELECT 1 FROM simulator_replay_frames f WHERE f.replay_id=r.id) AND NOT EXISTS (SELECT 1 FROM simulator_replay_chunks c WHERE c.replay_id=r.id) ORDER BY r.ended_at,r.id LIMIT ${Math.max(1, Math.min(500, Math.floor(limit)))}`, []);
  const report = {apply, replays: 0, frames: 0, jsonBytes: 0, compactBytes: 0, failed: [] as string[]};
  for (const candidate of candidates) {
    let converted: {frames: ReplayFrame[]; chunks: ReturnType<typeof buildCompactChunks>};
    try {
      const initial = JSON.parse(candidate.initial_state) as Exercise, frames = await jsonFrames(connection, candidate.id);
      const chunks = buildCompactChunks(initial, frames);
      // Never store a conversion that does not reproduce every frame.
      if (!chunksReproduce(initial, frames, chunks)) {report.failed.push(candidate.id); continue;}
      converted = {frames, chunks};
    } catch {report.failed.push(candidate.id); continue;}
    // A failed write is not caught: it aborts the run, so the enclosing transaction rolls back every chunk
    // already written and no replay is left with a partial compact copy. A retry converts it again.
    if (apply) {
      try {await writeCompactChunks(connection, candidate.id, converted.chunks, now);}
      catch (error) {throw new Error(`Writing compact replay ${candidate.id} failed; nothing from this run was kept`, {cause: error});}
    }
    report.replays++; report.frames += converted.frames.length;
    report.jsonBytes += converted.frames.reduce((sum, frame) => sum + Buffer.byteLength(JSON.stringify(frame.delta)), 0);
    report.compactBytes += converted.chunks.reduce((sum, chunk) => sum + chunk.data.length, 0);
  }
  return {...report, remaining: candidates.length >= limit};
}
/** Removes JSON frames of replays converted at least the soak period ago, after checking the compact copy once more. */
export async function deleteCompactedJsonFrames(connection: ChunkConnection, now: number, apply = false, limit = 50) {
  if (!await compactReplaysAvailable(connection)) throw new Error("Compact replay storage is not installed");
  const candidates = await rows<{id: string; initial_state: string}>(connection, `SELECT r.id,r.initial_state FROM simulator_replays r WHERE EXISTS (SELECT 1 FROM simulator_replay_frames f WHERE f.replay_id=r.id) AND (SELECT MAX(c.created_at) FROM simulator_replay_chunks c WHERE c.replay_id=r.id)<? ORDER BY r.id LIMIT ${Math.max(1, Math.min(500, Math.floor(limit)))}`, [now - COMPACT_SOAK_DAYS * DAY]);
  const report = {apply, replays: 0, frames: 0, failed: [] as string[]};
  for (const candidate of candidates) {
    try {
      const initial = JSON.parse(candidate.initial_state) as Exercise, frames = await jsonFrames(connection, candidate.id);
      const stored = await rows<ChunkRow>(connection, "SELECT chunk_no,sealed,data FROM simulator_replay_chunks WHERE replay_id=? ORDER BY chunk_no", [candidate.id]);
      if (!framesReproduce(frames, decodeChunks(stored, initial) ?? [])) {report.failed.push(candidate.id); continue;}
      if (apply) await connection.execute("DELETE FROM simulator_replay_frames WHERE replay_id=?", [candidate.id]);
      report.replays++; report.frames += frames.length;
    } catch {report.failed.push(candidate.id);}
  }
  return {...report, remaining: candidates.length >= limit};
}
