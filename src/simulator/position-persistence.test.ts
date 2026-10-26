import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {engineFor} from "./engine";
import {facilities} from "./aviation";
import {decodeSession, sqlSessionStore} from "./server/session-store";
import {setWritePoolForTests, setPoolForTests} from "../lib/db";

function fixture() {
  const exercise = engineFor({airport: "LGAV", trainingStation: "LGAV:approach"}).initialExercise(randomUUID());
  exercise.positions = facilities.filter(f => f.airport === "LGAV" && f.type === "approach").slice(0, 2).map((f, i) => ({id: `approach-${i + 1}`, name: i ? "Final" : "Initial", service: "approach", facilityId: f.id, mhz: f.mhz}));
  exercise.aircraft[0].positionId = exercise.positions[0].id;
  return {id: exercise.id, owner_id: "trainer", owner_name: "Trainer", title: "Split", created_at: 1, updated_at: 1, tick_at: 1, content_revision: 0, snapshot: JSON.stringify(exercise), staff_seat: null, mentee_seat: null, position_state: null as string | null};
}
test("position leases persist separately from replayable snapshots and decode on reconnect", async () => {
  const row = fixture(), statements: {sql: string; values: unknown[]}[] = [];
  const connection = {
    async execute(sql: string, values: unknown[] = []) {statements.push({sql, values}); return [sql.startsWith("SELECT * FROM simulator_sessions") ? [row] : [], []];},
    async query() {return [[], []];}, async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
  };
  setWritePoolForTests({async getConnection() {return connection;}} as never);
  const token = randomUUID();
  try {
    await sqlSessionStore.transaction(row.id, record => {
      record.positionState = {"approach-1": {assignment: {accountId: "alpha", name: "Alpha", assignedAt: 1, assignedBy: "trainer"}, seat: {token, accountId: "alpha", displayName: "Alpha", expiresAt: 9999}}};
    });
    const saved = statements.find(s => s.sql === "UPDATE simulator_sessions SET position_state=? WHERE id=?")!;
    assert.ok(saved); row.position_state = saved.values[0] as string;
    const decoded = decodeSession(row as never);
    assert.equal(decoded.positionState?.["approach-1"].seat?.token, token);
    assert.equal(decoded.exercise.positions?.[1].name, "Final");
    const snapshot = statements.find(s => s.sql.startsWith("UPDATE simulator_sessions SET updated_at="))!.values[3] as string;
    assert.equal(snapshot.includes(token), false);
    const replay = statements.find(s => s.sql.startsWith("INSERT INTO simulator_replays"))!;
    assert.ok(replay); assert.equal(JSON.stringify(replay.values).includes(token), false);
  } finally {setWritePoolForTests(undefined);}
});
test("a rejected position mutation rolls back before any snapshot, lease or replay is written", async () => {
  const row = fixture(); let rolledBack = false, mutations = 0;
  const connection = {async execute(sql: string) {if (!sql.startsWith("SELECT")) mutations++; return [[row], []];}, async query() {return [[], []];}, async beginTransaction() {}, async commit() {}, async rollback() {rolledBack = true;}, release() {}};
  setWritePoolForTests({async getConnection() {return connection;}} as never);
  try {
    await assert.rejects(sqlSessionStore.transaction(row.id, record => {record.positionState = {}; throw new Error("reject mutation");}), /reject mutation/);
    assert.equal(rolledBack, true); assert.equal(mutations, 0);
  } finally {setWritePoolForTests(undefined);}
});


test("legacy preference lookup retains its single SQL parameter", async () => {
  setPoolForTests({async execute(sql: string, values: unknown[]) {assert.match(sql, /account_id=\?/); assert.deepEqual(values, ["alpha"]); return [[{auto_readback: 1}], []];}} as never);
  try {assert.equal(await sqlSessionStore.autoReadback("alpha"), true);} finally {setPoolForTests(undefined);}
});
