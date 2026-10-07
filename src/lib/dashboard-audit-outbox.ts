import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2";

import { afterWriteCommit, withWriteTransaction } from "./db";
import { auditEventId, deliverDashboardAuditEvent, type DashboardAuditEvent } from "./dashboard-audit-client";

interface PendingEvent extends RowDataPacket { event_id: string; payload_json: string; attempts: number }
let flushing: Promise<void> | undefined;

export async function enqueueDashboardAuditEvent(event: DashboardAuditEvent) {
  const eventId = event.eventId ?? auditEventId(event.action, event.targetId);
  await withWriteTransaction(async (connection) => {
    await connection.execute(
      `INSERT INTO dashboard_audit_outbox (event_id, payload_json, next_attempt_at)
       VALUES (?, ?, UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE event_id = VALUES(event_id)`,
      [eventId, JSON.stringify({...event, eventId, occurredAt: event.occurredAt ?? Date.now()})],
    );
    afterWriteCommit(() => { void flushDashboardAuditOutbox(); });
  });
}

/** Lease a small batch atomically so independent server processes can replay safely. */
async function flushBatch(deliver: typeof deliverDashboardAuditEvent) {
  const lease = randomUUID();
  const pending = await withWriteTransaction(async (connection) => {
    const [rows] = await connection.execute<PendingEvent[]>(
      `SELECT event_id, payload_json, attempts FROM dashboard_audit_outbox
       WHERE next_attempt_at <= UTC_TIMESTAMP(3) ORDER BY next_attempt_at, event_id LIMIT 20 FOR UPDATE SKIP LOCKED`,
    );
    for (const row of rows) {
      await connection.execute(
        "UPDATE dashboard_audit_outbox SET lease_token = ?, next_attempt_at = TIMESTAMPADD(SECOND, 120, UTC_TIMESTAMP(3)) WHERE event_id = ?",
        [lease, row.event_id],
      );
    }
    return rows;
  });
  for (const row of pending) {
    let delivered = false;
    try { delivered = await deliver(JSON.parse(row.payload_json) as DashboardAuditEvent); }
    catch { console.warn("Invalid audit event remains pending", {eventId: row.event_id}); }
    await withWriteTransaction((connection) => delivered
      ? connection.execute("DELETE FROM dashboard_audit_outbox WHERE event_id = ? AND lease_token = ?", [row.event_id, lease])
      : connection.execute(
        `UPDATE dashboard_audit_outbox SET attempts = attempts + 1, lease_token = NULL,
         next_attempt_at = TIMESTAMPADD(SECOND, ?, UTC_TIMESTAMP(3)) WHERE event_id = ? AND lease_token = ?`,
        [Math.min(3600, 15 * 2 ** Math.min(row.attempts, 8)), row.event_id, lease],
      ));
  }
}

export function flushDashboardAuditOutbox(deliver = deliverDashboardAuditEvent): Promise<void> {
  if (flushing) return flushing;
  if (deliver === deliverDashboardAuditEvent && (!process.env.EXAMS_AUDIT_INGEST_URL?.trim() || !process.env.EXAMS_AUDIT_INGEST_KEY?.trim())) {
    return Promise.resolve();
  }
  flushing = flushBatch(deliver).catch(() => {
    // Payloads, database URLs, and response bodies must never appear in operational logs.
    console.warn("Dashboard audit outbox replay is unavailable; events remain pending");
  }).finally(() => { flushing = undefined; });
  return flushing;
}

export function startDashboardAuditOutboxWorker() {
  const timer = setInterval(() => { void flushDashboardAuditOutbox(); }, 15_000);
  timer.unref();
  void flushDashboardAuditOutbox();
  return () => clearInterval(timer);
}
