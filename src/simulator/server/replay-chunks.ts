import {deflateRawSync, inflateRawSync} from "node:zlib";
import type {RowDataPacket} from "mysql2/promise";
import {getAirport} from "../airports";
import type {Exercise} from "../model";
import {applyReplayDelta, type ReplayFrame} from "../replays";
import {concatBytes, decodeReplayFrames, encodeReplayFrame, framesMatch} from "../sweatbox-codec";

/** Compact replay storage: frames are binary and grouped into chunks of a minute, each sealed with deflate.
 * The open chunk of a live recording stays uncompressed so a frame is a cheap append. */
export const CHUNK_FRAMES = 60;
export interface ChunkConnection {execute(sql: string, values: (string | number | null | Uint8Array)[]): Promise<[unknown, unknown]>}
export interface ChunkRow extends RowDataPacket {replay_id?: string; chunk_no: number; first_sequence: number; last_sequence: number; frame_count: number; sealed: number | boolean; identities: string; data: Uint8Array | string}

/** The SQLite table; MariaDB uses migrations/016-compact-replays.sql. Created only by maintenance. */
export const SQLITE_CHUNKS_TABLE = "CREATE TABLE IF NOT EXISTS simulator_replay_chunks(replay_id TEXT NOT NULL REFERENCES simulator_replays(id) ON DELETE CASCADE, chunk_no INTEGER NOT NULL, first_sequence INTEGER NOT NULL, last_sequence INTEGER NOT NULL, frame_count INTEGER NOT NULL, sealed INTEGER NOT NULL DEFAULT 0, identities TEXT NOT NULL, created_at INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY(replay_id,chunk_no))";

// Old images keep working on the same database: compact storage begins once maintenance adds the table.
let available: boolean | undefined, checkedAt = 0;
export function resetCompactReplayDetection() {available = undefined; checkedAt = 0;}
export async function compactReplaysAvailable(connection: Pick<ChunkConnection, "execute">) {
  if (available || available === false && Date.now() - checkedAt < 60_000) return available;
  try {
    const [rows] = await connection.execute("SELECT COUNT(*) AS compact_replay_chunks FROM simulator_replay_chunks WHERE replay_id=?", [""]);
    const value = (rows as {compact_replay_chunks?: unknown}[])[0]?.compact_replay_chunks;
    available = typeof value === "number" || typeof value === "bigint" || typeof value === "string" && /^\d+$/.test(value);
  } catch {available = false;}
  checkedAt = Date.now();
  return available;
}

/** Ground altitudes the engine compares exactly survive quantisation. */
export function replayAnchors(exercise: Pick<Exercise, "airport" | "airportDataVersion" | "trainingStation">) {
  try {return [getAirport(exercise).elevation];} catch {return [];}
}
const bytesOf = (data: Uint8Array | string) => typeof data === "string" ? Buffer.from(data, "base64") : data;
const identitiesOf = (value: string | null | undefined) => {try {const list = JSON.parse(value ?? "[]"); return Array.isArray(list) ? list.filter((item): item is string => typeof item === "string") : [];} catch {return [];}};
const seal = (data: Uint8Array) => new Uint8Array(deflateRawSync(data, {level: 9}));

/** Appends one frame inside the recording transaction. Returns false when the replay began in the older JSON format. */
export async function appendCompactFrame(connection: ChunkConnection, replayId: string, previousSequence: number, before: Exercise, frame: ReplayFrame, close: boolean, now: number) {
  if (!await compactReplaysAvailable(connection)) return false;
  const [rows] = await connection.execute("SELECT chunk_no,first_sequence,last_sequence,frame_count,sealed,identities,data FROM simulator_replay_chunks WHERE replay_id=? ORDER BY chunk_no DESC LIMIT 1", [replayId]);
  const last = (rows as ChunkRow[])[0];
  if (!last && previousSequence > 0) return false;
  const identities = new Set<string>();
  const bytes = encodeReplayFrame(before, frame, {anchors: replayAnchors(before)}, identities);
  if (last && !Number(last.sealed) && Number(last.frame_count) < CHUNK_FRAMES) {
    const count = Number(last.frame_count) + 1, data = concatBytes([bytesOf(last.data), bytes]), sealed = close || count >= CHUNK_FRAMES;
    for (const id of identitiesOf(last.identities)) identities.add(id);
    await connection.execute("UPDATE simulator_replay_chunks SET last_sequence=?,frame_count=?,sealed=?,identities=?,data=? WHERE replay_id=? AND chunk_no=?",
      [frame.sequence, count, sealed ? 1 : 0, JSON.stringify([...identities]), sealed ? seal(data) : data, replayId, Number(last.chunk_no)]);
  } else {
    await connection.execute("INSERT INTO simulator_replay_chunks (replay_id,chunk_no,first_sequence,last_sequence,frame_count,sealed,identities,created_at,data) VALUES (?,?,?,?,?,?,?,?,?)",
      [replayId, last ? Number(last.chunk_no) + 1 : 0, frame.sequence, frame.sequence, 1, close ? 1 : 0, JSON.stringify([...identities]), now, close ? seal(bytes) : bytes]);
  }
  return true;
}
/** Seals a recording's open chunk without adding a frame, such as when a recording is closed early. */
export async function sealCompactFrames(connection: ChunkConnection, replayId: string) {
  const [rows] = await connection.execute("SELECT chunk_no,data FROM simulator_replay_chunks WHERE replay_id=? AND sealed=0", [replayId]);
  for (const row of rows as ChunkRow[]) await connection.execute("UPDATE simulator_replay_chunks SET sealed=1,data=? WHERE replay_id=? AND chunk_no=?", [seal(bytesOf(row.data)), replayId, Number(row.chunk_no)]);
}

/** Decodes chunks in order. Returns null when the replay has no compact frames. */
export function decodeChunks(rows: readonly ChunkRow[], initial: Exercise) {
  if (!rows.length) return null;
  const frames: ReplayFrame[] = [];
  let state = initial;
  for (const row of [...rows].sort((a, b) => Number(a.chunk_no) - Number(b.chunk_no))) {
    const data = bytesOf(row.data), raw = Number(row.sealed) ? new Uint8Array(inflateRawSync(data)) : data;
    const decoded = decodeReplayFrames(raw, state);
    frames.push(...decoded.frames); state = decoded.state;
  }
  return frames;
}
export async function readCompactFrames(query: (sql: string, values: string[]) => Promise<ChunkRow[]>, replayId: string, initial: Exercise) {
  const rows = await query("SELECT chunk_no,sealed,data FROM simulator_replay_chunks WHERE replay_id=? ORDER BY chunk_no", [replayId]).catch(() => [] as ChunkRow[]);
  return decodeChunks(rows, initial);
}

export interface CompactChunk {chunkNo: number; firstSequence: number; lastSequence: number; frameCount: number; identities: string[]; data: Uint8Array}
/** Sealed chunks for a complete list of frames, built in memory so they can be verified before writing. */
export function buildCompactChunks(initial: Exercise, frames: readonly ReplayFrame[]) {
  const anchors = replayAnchors(initial), chunks: CompactChunk[] = [];
  let state = initial;
  for (let start = 0; start < frames.length; start += CHUNK_FRAMES) {
    const identities = new Set<string>(), parts: Uint8Array[] = [], group = frames.slice(start, start + CHUNK_FRAMES);
    for (const frame of group) {parts.push(encodeReplayFrame(state, frame, {anchors}, identities)); state = applyReplayDelta(state, frame.delta);}
    chunks.push({chunkNo: chunks.length, firstSequence: group[0].sequence, lastSequence: group.at(-1)!.sequence, frameCount: group.length, identities: [...identities], data: seal(concatBytes(parts))});
  }
  return chunks;
}
/** Every decoded frame matches its source within the stated precision. */
export function framesReproduce(frames: readonly ReplayFrame[], decoded: readonly ReplayFrame[]) {
  return decoded.length === frames.length && decoded.every((frame, i) => frame.sequence === frames[i].sequence && frame.at === frames[i].at
    && frame.interpolate === frames[i].interpolate && framesMatch(frames[i].delta, frame.delta));
}
export function chunksReproduce(initial: Exercise, frames: readonly ReplayFrame[], chunks: readonly CompactChunk[]) {
  return framesReproduce(frames, decodeChunks(chunks.map(chunk => ({chunk_no: chunk.chunkNo, sealed: 1, data: chunk.data}) as ChunkRow), initial) ?? []);
}
/** Replaces a replay's compact frames, as account erasure does after anonymising them. */
export async function writeCompactChunks(connection: ChunkConnection, replayId: string, chunks: readonly CompactChunk[], now: number) {
  await connection.execute("DELETE FROM simulator_replay_chunks WHERE replay_id=?", [replayId]);
  for (const chunk of chunks) await connection.execute("INSERT INTO simulator_replay_chunks (replay_id,chunk_no,first_sequence,last_sequence,frame_count,sealed,identities,created_at,data) VALUES (?,?,?,?,?,?,?,?,?)",
    [replayId, chunk.chunkNo, chunk.firstSequence, chunk.lastSequence, chunk.frameCount, 1, JSON.stringify(chunk.identities), now, chunk.data]);
}
