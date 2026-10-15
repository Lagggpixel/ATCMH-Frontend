import type {RowDataPacket} from "mysql2/promise";
import {queryReadOnly, withWriteTransaction} from "../../lib/db";
import {scenarioRuntimeSchema} from "../scenarios";
import {exerciseSchema} from "../protocol";
import {SessionError, type SessionSummary} from "../sessions";
import {availableControl, type Seat, type SessionRecord, type SessionStore} from "./session-service";
import {recordReplay} from "./replay-store";

interface SessionRow extends RowDataPacket {
  airport?: string | null; airport_data_version?: string | null; training_station?: string | null;
  id: string; owner_id: string; owner_name: string | null; title: string; created_at: number; updated_at: number;
  tick_at: number; content_revision: number; snapshot: string; staff_seat: string | null; mentee_seat: string | null; scenario_runtime?: string | null;
}
export function decodeSession(row: SessionRow): SessionRecord {
  return {id: row.id, ownerId: row.owner_id, ownerName: row.owner_name ?? undefined, title: row.title, createdAt: Number(row.created_at), updatedAt: Number(row.updated_at),
    tickAt: Number(row.tick_at), contentRevision: Number(row.content_revision), exercise: exerciseSchema.parse(JSON.parse(row.snapshot)),
    ...(row.scenario_runtime ? {scenario: scenarioRuntimeSchema.parse(JSON.parse(row.scenario_runtime))} : {}),
    staff: row.staff_seat ? JSON.parse(row.staff_seat) as Seat : null, mentee: row.mentee_seat ? JSON.parse(row.mentee_seat) as Seat : null};
}
export const sqlSessionStore: SessionStore = {
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
    const rows = await queryReadOnly<SessionRow[]>("SELECT id,owner_id,owner_name,title,created_at,updated_at,staff_seat,mentee_seat,JSON_UNQUOTE(JSON_EXTRACT(snapshot,'$.airport')) AS airport,JSON_UNQUOTE(JSON_EXTRACT(snapshot,'$.airportDataVersion')) AS airport_data_version,JSON_UNQUOTE(JSON_EXTRACT(snapshot,'$.trainingStation')) AS training_station FROM simulator_sessions ORDER BY updated_at DESC");
    return rows.map(row => {
      const staff = row.staff_seat ? JSON.parse(row.staff_seat) as Seat : null;
      const mentee = row.mentee_seat ? JSON.parse(row.mentee_seat) as Seat : null;
      return {id: row.id, airport: row.airport ?? "EGPH", airportDataVersion: row.airport_data_version ?? undefined, trainingStation: row.training_station ?? undefined, ownerId: row.owner_id, ownerName: row.owner_name ?? undefined, title: row.title, createdAt: Number(row.created_at), updatedAt: Number(row.updated_at),
        ...(staff && staff.expiresAt > now ? {staffId: staff.accountId, staffName: staff.displayName} : {}),
        ...(mentee && mentee.expiresAt > now ? {menteeId: mentee.accountId, menteeName: mentee.displayName} : {}),
        staffOccupied: !!staff && staff.expiresAt > now, menteeOccupied: !!mentee && mentee.expiresAt > now} satisfies SessionSummary;
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
      return result;
    });
  },
  async end(id, accountId, now) {
    await withWriteTransaction(async connection => {
      const [rows] = await connection.execute<SessionRow[]>("SELECT * FROM simulator_sessions WHERE id=? FOR UPDATE", [id]);
      if (!rows[0]) throw new SessionError("not-found", "This session is unavailable or has ended.", 404);
      const ended = decodeSession(rows[0]);
      availableControl(ended, {accountId, staff: true}, now);
      ended.updatedAt = now;
      await recordReplay(connection, ended, ended, "ended");
      if (rows[0].scenario_runtime) {
        const record = decodeSession(rows[0]);
        if (record.scenario?.attemptId) await connection.execute("UPDATE simulator_attempts SET status='ended',finished_at=?,elapsed=?,result=? WHERE id=? AND status='active'", [Date.now(), record.exercise.elapsed, JSON.stringify({exercise: record.exercise, events: record.scenario.events}), record.scenario.attemptId]);
      }
      await connection.execute("DELETE FROM simulator_sessions WHERE id=?", [id]);
    });
  },
};
