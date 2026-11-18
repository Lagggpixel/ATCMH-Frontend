
import type {RowDataPacket} from "mysql2/promise";
import {queryReadOnly, withWriteTransaction} from "../../lib/simulator-db";
import {exerciseSchema} from "../protocol";
import {SessionError} from "../sessions";
import {endlessDefinition, type EndlessDefinition} from "../endless/definition";
import type {EndlessEvent, EndlessReport} from "../endless/runtime";
import type {Exercise} from "../model";
import type {ReplayFrame} from "../replays";
import {CHUNK_FRAMES, decodeChunks, compactReplaysAvailable, type ChunkConnection, type ChunkRow} from "./replay-chunks";

type CustomRow = RowDataPacket & {id: string; version: number; definition: string};
type ReplayRow = RowDataPacket & {id: string; initial_state: string; last_state: string; duration: number; sequence_no: number};
type IndexRow = RowDataPacket & {sequence_no: number; at_seconds: number; snapshot: string};
type FrameRow = RowDataPacket & {sequence_no: number; at_seconds: number; delta: string; interpolate: number};

export async function listEndless(owner: string) {
  const [custom, runs, replays] = await Promise.all([
    queryReadOnly<CustomRow[]>("SELECT id,version,definition FROM simulator_endless_scenarios WHERE owner_id=? ORDER BY updated_at DESC LIMIT 100", [owner]),
    queryReadOnly<(RowDataPacket & {id: string; title: string; airport: string})[]>(
      "SELECT id,title,JSON_UNQUOTE(JSON_EXTRACT(snapshot,'$.airport')) AS airport FROM simulator_sessions WHERE owner_id=? AND JSON_UNQUOTE(JSON_EXTRACT(snapshot,'$.endlessRun.ended'))='false' ORDER BY updated_at DESC LIMIT 50", [owner]),
    queryReadOnly<(RowDataPacket & {id: string; title: string; duration: number; ended_at: number})[]>(
      "SELECT id,title,duration,ended_at FROM simulator_replays WHERE owner_id=? AND ended_at IS NOT NULL AND JSON_EXTRACT(initial_state,'$.endlessRun') IS NOT NULL ORDER BY ended_at DESC LIMIT 50", [owner]),
  ]);
  return {custom: custom.map(row => ({id: row.id, version: Number(row.version), definition: endlessDefinition.parse(JSON.parse(row.definition))})), runs, replays};
}

export async function saveEndlessDefinition(owner: string, id: string, expectedVersion: number, definition: EndlessDefinition) {
  return withWriteTransaction(async connection => {
    const [rows] = await connection.execute<CustomRow[]>("SELECT id,version FROM simulator_endless_scenarios WHERE id=? AND owner_id=? FOR UPDATE", [id, owner]);
    const version = Number(rows[0]?.version ?? 0);
    if (version !== expectedVersion) throw new SessionError("stale-definition", "The scenario changed. Reload it before saving again.", 409);
    const now = Date.now();
    if (rows[0]) await connection.execute("UPDATE simulator_endless_scenarios SET version=?,definition=?,updated_at=? WHERE id=? AND owner_id=?", [version + 1, JSON.stringify(definition), now, id, owner]);
    else await connection.execute("INSERT INTO simulator_endless_scenarios (id,owner_id,version,definition,updated_at) VALUES (?,?,?,?,?)", [id, owner, 1, JSON.stringify(definition), now]);
    return {id, version: version + 1, definition};
  });
}

export async function appendEndlessIndex(connection: ChunkConnection, id: string, sequence: number, duration: number, exercise: Exercise) {
  if ((sequence - 1) % CHUNK_FRAMES === 0) {
    await connection.execute("INSERT INTO simulator_endless_replay_index (replay_id,sequence_no,at_seconds,snapshot) VALUES (?,?,?,?)",
      [id, sequence - 1, duration, JSON.stringify(exercise)]);
  }
}

export async function readEndlessReview(owner: string, id: string, at?: number) {
  const rows = await queryReadOnly<ReplayRow[]>(
    "SELECT id,initial_state,last_state,duration,sequence_no FROM simulator_replays WHERE id=? AND owner_id=? AND ended_at IS NOT NULL AND JSON_EXTRACT(initial_state,'$.endlessRun') IS NOT NULL", [id, owner]);
  const row = rows[0];
  if (!row) throw new SessionError("not-found", "This Endless replay is unavailable.", 404);
  const {endlessReview} = JSON.parse(row.last_state) as {endlessReview?: {report: EndlessReport; events: EndlessEvent[]}};
  if (at === undefined) return {review: endlessReview, duration: Number(row.duration)};

  const target = Math.min(at, Number(row.duration));
  const index = await queryReadOnly<IndexRow[]>(
    "SELECT sequence_no,at_seconds,snapshot FROM simulator_endless_replay_index WHERE replay_id=? AND at_seconds<=? ORDER BY at_seconds DESC,sequence_no DESC LIMIT 1", [id, target]);
  const start = Number(index[0]?.sequence_no ?? 0);
  const initial = exerciseSchema.parse(JSON.parse(index[0]?.snapshot ?? row.initial_state));
  const limit = start + CHUNK_FRAMES * 2;
  // A window starts on the first frame of a compact chunk, with the exact preceding aircraft state.
  let compact: ReplayFrame[] | null = null;
  if (await compactReplaysAvailable({execute: async (query, values) => [await queryReadOnly<ChunkRow[]>(query, values), []]})) {
    const chunks = await queryReadOnly<ChunkRow[]>(
      "SELECT chunk_no,first_sequence,last_sequence,sealed,data FROM simulator_replay_chunks WHERE replay_id=? AND first_sequence>? AND first_sequence<=? ORDER BY chunk_no", [id, start, limit]);
    compact = decodeChunks(chunks, initial);
  }
  const json = await queryReadOnly<FrameRow[]>(
    "SELECT sequence_no,at_seconds,delta,interpolate FROM simulator_replay_frames WHERE replay_id=? AND sequence_no>? AND sequence_no<=? ORDER BY sequence_no",
    [id, compact?.at(-1)?.sequence ?? start, limit]);
  const frames = [...compact ?? [], ...json.map(f => ({sequence: Number(f.sequence_no), at: Number(f.at_seconds), delta: JSON.parse(f.delta), interpolate: !!f.interpolate}))];
  return {window: {initial, frames, from: Number(index[0]?.at_seconds ?? 0), until: frames.at(-1)?.at ?? target}, duration: Number(row.duration)};
}
