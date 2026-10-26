import type {RowDataPacket} from "mysql2/promise";
import {queryReadOnly, withWriteTransaction} from "../../lib/db";
import {scenarioRuntimeSchema} from "../scenarios";
import {exerciseSchema} from "../protocol";
import {SessionError, type AssignedSession, type SessionSummary} from "../sessions";
import {availableControl, type Seat, type SessionAssignment, type SessionRecord, type SessionStore} from "./session-service";
import {recordReplay} from "./replay-store";

interface SessionRow extends RowDataPacket {
  airport?: string | null; airport_data_version?: string | null; training_station?: string | null;
  id: string; owner_id: string; owner_name: string | null; title: string; created_at: number; updated_at: number;
  tick_at: number; content_revision: number; snapshot: string; staff_seat: string | null; mentee_seat: string | null; scenario_runtime?: string | null; scenario_feedback?: string | null;
  assigned_mentee_id?: string | null; assigned_mentee_name?: string | null; assigned_at?: number | null; assigned_by?: string | null; assigned_by_name?: string | null;
}
function decodeAssignment(row: SessionRow): SessionAssignment | null {
  if (!row.assigned_mentee_id) return null;
  return {discordId: row.assigned_mentee_id, ...(row.assigned_mentee_name ? {name: row.assigned_mentee_name} : {}), assignedAt: Number(row.assigned_at ?? 0), assignedBy: row.assigned_by ?? "",
    ...(row.assigned_by_name ? {assignedByName: row.assigned_by_name} : {})};
}
const assignmentColumns = (assignment: SessionAssignment | null | undefined) => [assignment?.discordId ?? null, assignment?.name ?? null, assignment?.assignedAt ?? null, assignment?.assignedBy ?? null, assignment?.assignedByName ?? null];
export function decodeSession(row: SessionRow): SessionRecord {
  return {id: row.id, ownerId: row.owner_id, ownerName: row.owner_name ?? undefined, title: row.title, createdAt: Number(row.created_at), updatedAt: Number(row.updated_at),
    tickAt: Number(row.tick_at), contentRevision: Number(row.content_revision), exercise: exerciseSchema.parse(JSON.parse(row.snapshot)),
    ...(row.scenario_runtime ? {scenario: scenarioRuntimeSchema.parse(JSON.parse(row.scenario_runtime))} : {}),
    staff: row.staff_seat ? JSON.parse(row.staff_seat) as Seat : null, mentee: row.mentee_seat ? JSON.parse(row.mentee_seat) as Seat : null, assignment: decodeAssignment(row)};
}
export const sqlSessionStore: SessionStore = {
  async read(id) {
    const rows = await queryReadOnly<SessionRow[]>("SELECT * FROM simulator_sessions WHERE id=?", [id]);
    if (!rows[0]) throw new SessionError("not-found", "This session is unavailable or has ended.", 404);
    return decodeSession(rows[0]);
  },
  async autoReadback(accountId) {
    const rows = await queryReadOnly<(RowDataPacket & {auto_readback: number})[]>("SELECT auto_readback FROM simulator_staff_preferences WHERE account_id=?", [accountId]);
    return rows[0] ? rows[0].auto_readback === 1 : undefined;
  },
  async saveAutoReadback(accountId, enabled, now) {
    await withWriteTransaction(async connection => {
      await connection.execute("INSERT INTO simulator_staff_preferences (account_id,auto_readback,updated_at) VALUES (?,?,?) ON DUPLICATE KEY UPDATE auto_readback=VALUES(auto_readback),updated_at=VALUES(updated_at)", [accountId, enabled ? 1 : 0, now]);
    });
  },
  async list(now) {
    const rows = await queryReadOnly<SessionRow[]>("SELECT id,owner_id,owner_name,title,created_at,updated_at,staff_seat,mentee_seat,assigned_mentee_id,assigned_mentee_name,JSON_UNQUOTE(JSON_EXTRACT(snapshot,'$.airport')) AS airport,JSON_UNQUOTE(JSON_EXTRACT(snapshot,'$.airportDataVersion')) AS airport_data_version,JSON_UNQUOTE(JSON_EXTRACT(snapshot,'$.trainingStation')) AS training_station,JSON_UNQUOTE(JSON_EXTRACT(scenario_runtime,'$.feedback')) AS scenario_feedback FROM simulator_sessions ORDER BY updated_at DESC");
    return rows.map(row => {
      const staff = row.staff_seat ? JSON.parse(row.staff_seat) as Seat : null;
      const mentee = row.mentee_seat ? JSON.parse(row.mentee_seat) as Seat : null;
      return {id: row.id, airport: row.airport ?? "EGPH", airportDataVersion: row.airport_data_version ?? undefined, trainingStation: row.training_station ?? undefined, ownerId: row.owner_id, ownerName: row.owner_name ?? undefined, title: row.title, createdAt: Number(row.created_at), updatedAt: Number(row.updated_at),
        ...(staff && staff.expiresAt > now ? {staffId: staff.accountId, staffName: staff.displayName} : {}),
        ...(mentee && mentee.expiresAt > now ? {menteeId: mentee.accountId, menteeName: mentee.displayName} : {}),
        staffOccupied: !!staff && staff.expiresAt > now, menteeOccupied: !!mentee && mentee.expiresAt > now,
        ...(row.assigned_mentee_id ? {assignedMenteeId: row.assigned_mentee_id, assignedMenteeName: row.assigned_mentee_name ?? undefined} : {}),
        ...(row.scenario_feedback ? {hasFeedback: true} : {})} satisfies SessionSummary;
    });
  },
  async create(record) {
    await withWriteTransaction(async connection => {
      if (record.scenario) {
        await connection.execute("INSERT INTO simulator_sessions (id,owner_id,title,created_at,updated_at,tick_at,content_revision,snapshot,scenario_runtime,owner_name) VALUES (?,?,?,?,?,?,?,?,?,?)", [record.id, record.ownerId, record.title, record.createdAt, record.updatedAt, record.tickAt, record.contentRevision, JSON.stringify(record.exercise), JSON.stringify(record.scenario), record.ownerName ?? null]);
      } else await connection.execute("INSERT INTO simulator_sessions (id,owner_id,title,created_at,updated_at,tick_at,content_revision,snapshot,owner_name) VALUES (?,?,?,?,?,?,?,?,?)",
        [record.id, record.ownerId, record.title, record.createdAt, record.updatedAt, record.tickAt, record.contentRevision, JSON.stringify(record.exercise), record.ownerName ?? null]);
      await recordReplay(connection, record);
    });
  },
  async transaction(id, run) {
    return withWriteTransaction(async connection => {
      const [rows] = await connection.execute<SessionRow[]>("SELECT * FROM simulator_sessions WHERE id=? FOR UPDATE", [id]);
      if (!rows[0]) throw new SessionError("not-found", "This session is unavailable or has ended.", 404);
      const record = decodeSession(rows[0]), before = structuredClone(record), result = await run(record);
      await recordReplay(connection, record, before);
      await connection.execute("UPDATE simulator_sessions SET updated_at=?,tick_at=?,content_revision=?,snapshot=?,staff_seat=?,mentee_seat=? WHERE id=?",
        [record.updatedAt, record.tickAt, record.contentRevision, JSON.stringify(record.exercise), record.staff ? JSON.stringify(record.staff) : null, record.mentee ? JSON.stringify(record.mentee) : null, id]);
      if (record.scenario) await connection.execute("UPDATE simulator_sessions SET scenario_runtime=? WHERE id=?", [JSON.stringify(record.scenario), id]);
      if (JSON.stringify(record.assignment ?? null) !== JSON.stringify(before.assignment ?? null))
        await connection.execute("UPDATE simulator_sessions SET assigned_mentee_id=?,assigned_mentee_name=?,assigned_at=?,assigned_by=?,assigned_by_name=? WHERE id=?", [...assignmentColumns(record.assignment), id]);
      return result;
    });
  },
  async end(id, accountId, now, feedback) {
    await withWriteTransaction(async connection => {
      const [rows] = await connection.execute<SessionRow[]>("SELECT * FROM simulator_sessions WHERE id=? FOR UPDATE", [id]);
      if (!rows[0]) throw new SessionError("not-found", "This session is unavailable or has ended.", 404);
      const ended = decodeSession(rows[0]);
      availableControl(ended, {accountId, staff: true}, now);
      ended.updatedAt = now;
      await recordReplay(connection, ended, ended, "ended", feedback);
      if (rows[0].scenario_runtime) {
        const record = decodeSession(rows[0]);
        if (record.scenario?.attemptId) await connection.execute("UPDATE simulator_attempts SET status='ended',finished_at=?,elapsed=?,result=? WHERE id=? AND status='active'", [Date.now(), record.exercise.elapsed, JSON.stringify({exercise: record.exercise, events: record.scenario.events}), record.scenario.attemptId]);
      }
      await connection.execute("DELETE FROM simulator_sessions WHERE id=?", [id]);
    });
  },
  async assigned(discordId, now) {
    const rows = await queryReadOnly<(RowDataPacket & {id: string; title: string; owner_name: string | null; staff_seat: string | null; mentee_seat: string | null; assigned_at: number | null; airport: string | null; training_station: string | null; paused: string | null})[]>(
      "SELECT id,title,owner_name,staff_seat,mentee_seat,assigned_at,JSON_UNQUOTE(JSON_EXTRACT(snapshot,'$.airport')) AS airport,JSON_UNQUOTE(JSON_EXTRACT(snapshot,'$.trainingStation')) AS training_station,JSON_UNQUOTE(JSON_EXTRACT(snapshot,'$.pausedByStaff')) AS paused FROM simulator_sessions WHERE assigned_mentee_id=? ORDER BY assigned_at DESC LIMIT 50", [discordId]);
    return rows.map(row => {
      const staff = row.staff_seat ? JSON.parse(row.staff_seat) as Seat : null, mentee = row.mentee_seat ? JSON.parse(row.mentee_seat) as Seat : null;
      return {id: row.id, title: row.title, airport: row.airport ?? "EGPH", ...(row.training_station ? {trainingStation: row.training_station} : {}), ...(row.owner_name ? {trainerName: row.owner_name} : {}),
        assignedAt: Number(row.assigned_at ?? 0), trainerConnected: !!staff && staff.expiresAt > now, youConnected: !!mentee && mentee.expiresAt > now && mentee.discordId === discordId, paused: row.paused === "true"} satisfies AssignedSession;
    });
  },
  async hasAssignment(discordId) {
    return (await queryReadOnly<RowDataPacket[]>("SELECT 1 FROM simulator_sessions WHERE assigned_mentee_id=? LIMIT 1", [discordId])).length > 0;
  },
  async lookup(entry) {
    const select = "SELECT id,title,owner_name,assigned_mentee_id,JSON_UNQUOTE(JSON_EXTRACT(snapshot,'$.airport')) AS airport FROM simulator_sessions";
    type Row = RowDataPacket & {id: string; title: string; owner_name: string | null; assigned_mentee_id: string | null; airport: string | null};
    let rows: Row[];
    if ("id" in entry) rows = await queryReadOnly<Row[]>(`${select} WHERE id=?`, [entry.id]);
    else {
      const [airport, hex] = entry.code.split("-"), prefix = `${hex.slice(0, 8)}-${hex.slice(8, 12)}`.toLowerCase();
      rows = (await queryReadOnly<Row[]>(`${select} WHERE id LIKE ? LIMIT 5`, [`${prefix}%`])).filter(row => (row.airport ?? "EGPH") === airport);
    }
    const row = rows.length === 1 ? rows[0] : undefined;
    return row ? {id: row.id, title: row.title, airport: row.airport ?? "EGPH", ...(row.owner_name ? {ownerName: row.owner_name} : {}), ...(row.assigned_mentee_id ? {assignedDiscordId: row.assigned_mentee_id} : {})} : null;
  },
};

/** Lets mentees admitted only by an assignment load the shared airport, scope and navigation data. */
export const assignedMentee = {hasAssignment: (discordId: string) => sqlSessionStore.hasAssignment(discordId)};
