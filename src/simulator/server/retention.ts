import {decodeSession} from "./session-store";
import {recordReplay} from "./replay-store";
/** Maintenance only: never called by an HTTP request or on application startup. */
export const RETENTION_DAYS = {inactiveSession: 90, unusedPreference: 365} as const;
const DAY = 86_400_000;
export interface RetentionConnection {execute(sql: string, values: (string | number | null)[]): Promise<[unknown, unknown]>}
interface Candidate {id: string}
async function candidates(connection: RetentionConnection, sql: string, values: (string | number)[]) {
  const [rows] = await connection.execute(sql, values);
  return rows as Candidate[];
}
const placeholders = (ids: Candidate[]) => ids.map(() => "?").join(",");
/** Run inside one transaction. Dry run returns counts and performs no writes. */
export async function maintainSimulatorRecords(connection: RetentionConnection, now: number, apply = false) {
  if (!Number.isSafeInteger(now) || now <= 0) throw new Error("Invalid maintenance time");
  const sessions = await candidates(connection, "SELECT * FROM simulator_sessions WHERE updated_at<? AND (staff_seat IS NULL OR COALESCE(JSON_EXTRACT(staff_seat,'$.expiresAt'),0)<?) AND (mentee_seat IS NULL OR COALESCE(JSON_EXTRACT(mentee_seat,'$.expiresAt'),0)<?) ORDER BY updated_at LIMIT 500 FOR UPDATE", [now - RETENTION_DAYS.inactiveSession * DAY, now, now]);
  const preferences = await candidates(connection, "SELECT account_id AS id FROM simulator_staff_preferences WHERE updated_at<? AND NOT EXISTS (SELECT 1 FROM simulator_sessions s WHERE s.owner_id=simulator_staff_preferences.account_id) ORDER BY updated_at LIMIT 500 FOR UPDATE", [now - RETENTION_DAYS.unusedPreference * DAY]);
  if (apply) {
    if (sessions.length) {
      const ids = sessions.map(s => s.id), slots = placeholders(sessions);
      for (const row of sessions) {
        const record = decodeSession(row as Parameters<typeof decodeSession>[0]); record.updatedAt = now;
        await recordReplay(connection, record, record, "expired");
        await connection.execute("UPDATE simulator_attempts SET status='ended',finished_at=?,elapsed=?,result=? WHERE status='active' AND session_id=?", [now, record.exercise.elapsed, JSON.stringify({exercise: record.exercise, events: record.scenario?.events ?? []}), record.id]);
      }
      await connection.execute(`DELETE FROM simulator_sessions WHERE id IN (${slots})`, ids);
    }
    if (preferences.length) await connection.execute(`DELETE FROM simulator_staff_preferences WHERE account_id IN (${placeholders(preferences)})`, preferences.map(p => p.id));
  }
  return {expiredSessions: sessions.length, clearedAttemptDetails: 0, expiredPreferences: preferences.length, apply};
}
/** Operator-reviewed learner erasure, including legacy assignments; never deletes author scenarios. */
export async function eraseSimulatorLearner(connection: RetentionConnection, accountId: string, apply = false) {
  if (!/^[a-zA-Z0-9_-]{1,32}$/.test(accountId)) throw new Error("Invalid account identifier");
  const assignments = await candidates(connection, "SELECT id FROM simulator_assignments WHERE learner_id=? FOR UPDATE", [accountId]);
  const attempts = await candidates(connection, "SELECT id,session_id FROM simulator_attempts WHERE learner_id=? OR assignment_id IN (SELECT id FROM simulator_assignments WHERE learner_id=?) FOR UPDATE", [accountId, accountId]) as (Candidate & {session_id: string})[];
  const replays = await candidates(connection, "SELECT id,session_id FROM simulator_replays WHERE JSON_CONTAINS(participants,JSON_OBJECT('accountId',?,'role','mentee')) OR attempt_id IN (SELECT id FROM simulator_attempts WHERE learner_id=?) FOR UPDATE", [accountId, accountId]) as (Candidate & {session_id: string})[];
  if (apply) {
    const sessions = [...new Set([...attempts, ...replays].map(a => a.session_id))].map(id => ({id}));
    if (sessions.length) await connection.execute(`DELETE FROM simulator_sessions WHERE id IN (${placeholders(sessions)})`, sessions.map(s => s.id));
    if (replays.length) await connection.execute(`DELETE FROM simulator_replays WHERE id IN (${placeholders(replays)})`, replays.map(r => r.id));
    if (attempts.length) await connection.execute(`DELETE FROM simulator_attempts WHERE id IN (${placeholders(attempts)})`, attempts.map(a => a.id));
    if (assignments.length) await connection.execute(`DELETE FROM simulator_assignments WHERE id IN (${placeholders(assignments)})`, assignments.map(a => a.id));
    await connection.execute("DELETE FROM simulator_staff_preferences WHERE account_id=?", [accountId]);
  }
  return {assignments: assignments.length, attempts: attempts.length, replays: replays.length, apply};
}
