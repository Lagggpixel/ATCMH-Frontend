import assert from "node:assert/strict";
import test from "node:test";
import { setWritePoolForTests, withWriteTransaction } from "./db";
import { enqueueDashboardAuditEvent, flushDashboardAuditOutbox } from "./dashboard-audit-outbox";

const event = {eventId: "event-1", occurredAt: 1790942400000, action: "exam.quiz.update" as const, targetId: "quiz-1", summary: "Updated quiz", actorId: "123"};

function database() {
  const state = {rows: new Map<string, {event_id: string; payload_json: string; attempts: number; due: boolean; lease?: string}>(),
    mutations: 0, failEnqueue: false, commands: [] as string[]};
  let working: typeof state.rows;
  let mutations: number;
  const connection = {
    async query() { working = structuredClone(state.rows); mutations = state.mutations; state.commands.push("BEGIN"); },
    async execute(sql: string, values: unknown[] = []) {
      state.commands.push(sql);
      if (sql.startsWith("INSERT INTO dashboard_audit_outbox")) {
        if (state.failEnqueue) throw new Error("outbox unavailable");
        if (!working.has(String(values[0]))) working.set(String(values[0]), {event_id: String(values[0]), payload_json: String(values[1]), attempts: 0, due: true});
      } else if (sql.startsWith("SELECT event_id")) return [[...working.values()].filter(row => row.due)] as never;
      else if (sql.startsWith("UPDATE dashboard_audit_outbox SET lease_token")) {
        const row = working.get(String(values[1]))!; row.lease = String(values[0]); row.due = false;
      } else if (sql.startsWith("DELETE FROM dashboard_audit_outbox")) {
        if (working.get(String(values[0]))?.lease === values[1]) working.delete(String(values[0]));
      } else if (sql.includes("SET attempts = attempts + 1")) {
        const row = working.get(String(values[1]))!; row.attempts++; row.lease = undefined; row.due = false;
      } else if (sql === "APPLICATION MUTATION") mutations++;
      return [{affectedRows: 1}] as never;
    },
    async commit() { state.rows = working; state.mutations = mutations; state.commands.push("COMMIT"); },
    async rollback() { state.commands.push("ROLLBACK"); },
    release() { state.commands.push("RELEASE"); },
  };
  setWritePoolForTests({getConnection: async () => connection} as never);
  return state;
}

test("an outage retains the event; a later worker replays the same ID and removes it only after acknowledgement", async () => {
  const state = database();
  try {
    await enqueueDashboardAuditEvent(event);
    await flushDashboardAuditOutbox(async () => false);
    assert.equal(state.rows.get("event-1")?.attempts, 1);
    state.rows.get("event-1")!.due = true;
    const sent: unknown[] = [];
    await flushDashboardAuditOutbox(async pending => { sent.push(pending); return true; });
    assert.deepEqual(sent, [event]);
    assert.equal(state.rows.size, 0);
  } finally { setWritePoolForTests(undefined); }
});

test("nested application writes and audit records use one transaction and roll back together", async () => {
  const state = database();
  state.failEnqueue = true;
  try {
    await assert.rejects(() => withWriteTransaction(async connection => {
      await connection.execute("APPLICATION MUTATION");
      await enqueueDashboardAuditEvent(event);
    }), /outbox unavailable/);
    assert.equal(state.mutations, 0);
    assert.equal(state.rows.size, 0);
    assert.equal(state.commands.filter(command => command === "BEGIN").length, 1);
    assert.equal(state.commands.includes("COMMIT"), false);
  } finally { setWritePoolForTests(undefined); }
});

test("repeated enqueue preserves the original payload and an interrupted worker lease can be retried", async () => {
  const state = database();
  try {
    await enqueueDashboardAuditEvent(event);
    await enqueueDashboardAuditEvent({...event, actorId: "different"});
    assert.equal(JSON.parse(state.rows.get("event-1")!.payload_json).actorId, "123");
    state.rows.get("event-1")!.lease = "old-process";
    state.rows.get("event-1")!.due = true;
    await flushDashboardAuditOutbox(async pending => { assert.equal(pending.eventId, "event-1"); return true; });
    assert.equal(state.rows.size, 0);
  } finally { setWritePoolForTests(undefined); }
});
