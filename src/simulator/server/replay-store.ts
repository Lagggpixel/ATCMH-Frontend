import {randomUUID} from "node:crypto";
import type {RowDataPacket} from "mysql2/promise";
import {queryReadOnly} from "../../lib/db";
import {exerciseSchema} from "../protocol";
import {demoReplayMarks} from "../demonstration";
import {demoHub} from "./demo-hub";
import {replayDelta, replayState, type ReplayDetail, type ReplayFrame, type ReplayParticipant, type ReplaySummary} from "../replays";
import {SessionError} from "../sessions";
import type {SessionRecord} from "./session-service";
import {rejectMovedRadar} from "./radar-moved";

// Small connection surface also permits the operator's retention transaction to archive first.
export interface ReplayConnection {execute(sql: string, values: (string | number | null)[]): Promise<[unknown, unknown]>}
interface ReplayRow extends RowDataPacket {
  airport?: string | null; airport_data_version?: string | null; training_station?: string | null;
  id: string; session_id: string; attempt_id: string | null; owner_id: string; owner_name: string | null; title: string;
  started_at: number; ended_at: number | null; status: string; duration: number; sequence_no: number;
  content_revision: number; initial_state: string; last_state: string; participants: string; partial: number; feedback?: string;
}
function participants(record: SessionRecord, previous: ReplayParticipant[] = []) {
  const result = [...previous];
  for (const role of ["staff", "mentee"] as const) {
    const seat = record[role]; if (!seat) continue;
    const index = result.findIndex(p => p.role === role && p.accountId === seat.accountId);
    const participant = {role, accountId: seat.accountId, ...(seat.displayName ? {name: seat.displayName} : {})};
    if (index < 0) result.push(participant); else result[index] = {...result[index], ...participant};
  }
  return result;
}
function summary(row: ReplayRow): ReplaySummary {
  return {airport: row.airport ?? "EGPH", airportDataVersion: row.airport_data_version ?? undefined, trainingStation: row.training_station ?? undefined, id: row.id, sessionId: row.session_id, title: row.title, ownerId: row.owner_id, ownerName: row.owner_name ?? undefined,
    startedAt: Number(row.started_at), endedAt: Number(row.ended_at), duration: Number(row.duration), status: row.status,
    participants: JSON.parse(row.participants), partial: !!row.partial, kind: "recording", feedback: row.feedback || undefined};
}
/** Called in the same transaction as the live state: saving and recording succeed or roll back together. */
/** Feedback given while archiving fills the replay only when the attempt has none of its own. */
export async function recordReplay(connection: ReplayConnection, record: SessionRecord, before?: SessionRecord, closing?: string, feedback?: string) {
  const [rows] = await connection.execute("SELECT * FROM simulator_replays WHERE session_id=? ORDER BY (status='recording') DESC,started_at DESC,id DESC LIMIT 1 FOR UPDATE", [record.id]);
  let row: ReplayRow | undefined = (rows as ReplayRow[])[0];
  const changedAttempt = before?.scenario?.attemptId !== record.scenario?.attemptId;
  const reset = !!before && (changedAttempt || record.exercise.elapsed < before.exercise.elapsed);
  if (reset) {
    if (!row || row.status === "recording") await recordReplay(connection, before!, before!, changedAttempt ? "restarted" : "reset");
    row = undefined;
  }
  const state = replayState(record.exercise), now = Math.max(record.updatedAt, record.tickAt);
  if (!row) {
    const id = record.scenario?.attemptId ?? randomUUID(), partial = !!before && !reset;
    await connection.execute("INSERT INTO simulator_replays (id,session_id,attempt_id,owner_id,owner_name,title,started_at,content_revision,initial_state,last_state,participants,partial) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
      [id, record.id, record.scenario?.attemptId ?? null, record.ownerId, record.ownerName ?? null, record.title, now, record.contentRevision, JSON.stringify(state), JSON.stringify(state), JSON.stringify(participants(record)), partial ? 1 : 0]);
    row = {id, session_id: record.id, attempt_id: record.scenario?.attemptId ?? null, status: "recording", duration: 0, sequence_no: 0, content_revision: record.contentRevision, last_state: JSON.stringify(state), participants: JSON.stringify(participants(record))} as ReplayRow;
  }
  if (row.status !== "recording") return;
  const previous = exerciseSchema.parse(JSON.parse(row.last_state)), elapsed = Math.max(0, state.elapsed - previous.elapsed);
  const ended = closing ?? (record.scenario?.finished ? "finished" : undefined);
  const changed = record.contentRevision !== Number(row.content_revision);
  let sequence = Number(row.sequence_no), duration = Number(row.duration);
  if (elapsed >= 1 || changed || ended) {
    duration += elapsed; sequence++;
    // The trainer's pointer and commands since the last frame ride along with it.
    const demo = demoReplayMarks(demoHub.drainTrace(record.id), duration, state.elapsed);
    const delta = {...replayDelta(previous, state), ...(demo.length ? {demo} : {})};
    await connection.execute("INSERT INTO simulator_replay_frames (replay_id,sequence_no,at_seconds,delta,interpolate) VALUES (?,?,?,?,?)", [row.id, sequence, duration, JSON.stringify(delta), changed ? 0 : 1]);
    await connection.execute("UPDATE simulator_replays SET last_state=?,sequence_no=?,duration=?,content_revision=? WHERE id=?", [JSON.stringify(state), sequence, duration, record.contentRevision, row.id]);
  }
  const people = JSON.stringify(participants(record, JSON.parse(row.participants)));
  if (people !== row.participants) await connection.execute("UPDATE simulator_replays SET participants=? WHERE id=?", [people, row.id]);
  if (ended) await connection.execute("UPDATE simulator_replays SET status=?,ended_at=?,feedback=? WHERE id=?", [ended, now, record.scenario?.feedback || feedback || null, row.id]);
}

interface LegacyRow extends RowDataPacket {id: string; session_id: string; title: string; owner_id: string; learner_id: string | null; started_at: number; finished_at: number; elapsed: number; status: string; result: string | null; feedback: string}
function legacySummary(row: LegacyRow): ReplaySummary {
  return {id: row.id, sessionId: row.session_id, title: row.title, ownerId: row.owner_id, startedAt: Number(row.started_at), endedAt: Number(row.finished_at), duration: Number(row.elapsed), status: row.status,
    participants: [{role: "staff", accountId: row.owner_id}, ...(row.learner_id ? [{role: "mentee" as const, accountId: row.learner_id}] : [])], kind: row.result ? "snapshot" : "unavailable", partial: true, feedback: row.feedback || undefined};
}
const legacySelect = "SELECT a.*,COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r.definition,'$.title')),'Previous training attempt') AS title FROM simulator_attempts a LEFT JOIN simulator_scenario_revisions r ON r.scenario_id=a.scenario_id AND r.revision=a.revision";
export interface ReplayFilters {mentorId?: string; menteeId?: string; search?: string; airport?: string; recordedOn?: number}
export async function listReplays(offset: number, filters: ReplayFilters = {}) {
  // Independent bounded queries merged by completion time include surviving pre-recording attempts.
  const limit = offset + 51;
  const recordedWhere: string[] = ["COALESCE(JSON_UNQUOTE(JSON_EXTRACT(initial_state,'$.trainingStation')),'') NOT REGEXP ':(approach|center)$'"], legacyWhere: string[] = ["COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r.definition,'$.trainingStation')),'') NOT REGEXP ':(approach|center)$'"];
  const recordedValues: (string | number)[] = [], legacyValues: (string | number)[] = [];
  if (filters.recordedOn !== undefined) {
    recordedWhere.push("ended_at>=? AND ended_at<?");
    legacyWhere.push("a.finished_at>=? AND a.finished_at<?");
    recordedValues.push(filters.recordedOn, filters.recordedOn + 86_400_000);
    legacyValues.push(filters.recordedOn, filters.recordedOn + 86_400_000);
  }
  if (filters.mentorId) {
    // Match a single historical staff participant, not the creator or a mentee seat.
    recordedWhere.push("JSON_CONTAINS(participants, ?) = 1");
    recordedValues.push(JSON.stringify({role: "staff", accountId: filters.mentorId}));
    legacyWhere.push("a.owner_id=?"); legacyValues.push(filters.mentorId);
  }
  if (filters.menteeId) {
    // A Mentee's own history: sessions where they held the mentee seat.
    recordedWhere.push("JSON_CONTAINS(participants, ?) = 1");
    recordedValues.push(JSON.stringify({role: "mentee", accountId: filters.menteeId}));
    legacyWhere.push("a.learner_id=?"); legacyValues.push(filters.menteeId);
  }
  if (filters.airport) {
    recordedWhere.push("COALESCE(JSON_UNQUOTE(JSON_EXTRACT(initial_state,'$.airport')),'EGPH')=?"); recordedValues.push(filters.airport);
    // Legacy summaries have always used the original EGPH environment.
    legacyWhere.push("?='EGPH'"); legacyValues.push(filters.airport);
  }
  if (filters.search) {
    recordedWhere.push("LOCATE(LOWER(?),LOWER(CONCAT_WS(' ',title,participants,COALESCE(JSON_UNQUOTE(JSON_EXTRACT(initial_state,'$.airport')),'EGPH'))))>0"); recordedValues.push(filters.search);
    legacyWhere.push("LOCATE(LOWER(?),LOWER(CONCAT_WS(' ',JSON_UNQUOTE(JSON_EXTRACT(r.definition,'$.title')),a.owner_id,a.learner_id,'EGPH')))>0"); legacyValues.push(filters.search);
  }
  const recordedClause = recordedWhere.length ? ` AND ${recordedWhere.join(" AND ")}` : "";
  const legacyClause = legacyWhere.length ? ` AND ${legacyWhere.join(" AND ")}` : "";
  const [recordings, legacy] = await Promise.all([
    queryReadOnly<ReplayRow[]>(`SELECT id,session_id,owner_id,owner_name,title,started_at,ended_at,status,duration,participants,partial,feedback,JSON_UNQUOTE(JSON_EXTRACT(initial_state,'$.airport')) AS airport,JSON_UNQUOTE(JSON_EXTRACT(initial_state,'$.airportDataVersion')) AS airport_data_version,JSON_UNQUOTE(JSON_EXTRACT(initial_state,'$.trainingStation')) AS training_station FROM simulator_replays WHERE ended_at IS NOT NULL${recordedClause} ORDER BY ended_at DESC,id DESC LIMIT ${limit}`, recordedValues),
    queryReadOnly<LegacyRow[]>(`${legacySelect} WHERE a.status<>'active' AND NOT EXISTS (SELECT 1 FROM simulator_replays p WHERE p.attempt_id=a.id)${legacyClause} ORDER BY a.finished_at DESC,a.id DESC LIMIT ${limit}`, legacyValues),
  ]);
  const all = [...recordings.map(summary), ...legacy.map(legacySummary)].sort((a, b) => b.endedAt - a.endedAt || b.id.localeCompare(a.id));
  return {replays: all.slice(offset, offset + 50), next: all.length > offset + 50 ? offset + 50 : null};
}
/** With menteeId, only a replay that account took part in as the Mentee is readable. */
export async function readReplay(id: string, after: number, menteeId?: string): Promise<ReplayDetail> {
  const detail = await readAnyReplay(id, after);
  if (menteeId && !detail.replay.participants.some(p => p.role === "mentee" && p.accountId === menteeId))
    throw new SessionError("not-found", "This replay is unavailable or the session is still recording.", 404);
  return detail;
}
async function readAnyReplay(id: string, after: number): Promise<ReplayDetail> {
  const rows = await queryReadOnly<ReplayRow[]>("SELECT * FROM simulator_replays WHERE id=? AND ended_at IS NOT NULL", [id]);
  if (!rows[0]) {
    const old = await queryReadOnly<LegacyRow[]>(`${legacySelect} WHERE a.id=? AND a.status<>'active'`, [id]);
    if (!old[0]) throw new SessionError("not-found", "This replay is unavailable or the session is still recording.", 404);
    const initial = old[0].result ? exerciseSchema.parse(JSON.parse(old[0].result).exercise) : null;
    if (initial) rejectMovedRadar(initial);
    return {replay: legacySummary(old[0]), initial, frames: [], next: null};
  }
  const row = rows[0], initial = exerciseSchema.parse(JSON.parse(row.initial_state));
  rejectMovedRadar(initial);
  row.airport = initial.airport; row.airport_data_version = initial.airportDataVersion; row.training_station = initial.trainingStation;
  const frames = await queryReadOnly<(RowDataPacket & {sequence_no: number; at_seconds: number; delta: string; interpolate: number})[]>("SELECT sequence_no,at_seconds,delta,interpolate FROM simulator_replay_frames WHERE replay_id=? AND sequence_no>? ORDER BY sequence_no LIMIT 500", [id, after]);
  const result: ReplayFrame[] = frames.map(f => ({sequence: Number(f.sequence_no), at: Number(f.at_seconds), delta: JSON.parse(f.delta), interpolate: !!f.interpolate}));
  const last = result.at(-1)?.sequence ?? after;
  return {replay: summary(row), initial: exerciseSchema.parse(JSON.parse(row.initial_state)), frames: result, next: last < Number(row.sequence_no) ? last : null};
}
