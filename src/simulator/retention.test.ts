import assert from "node:assert/strict";
import test from "node:test";
import {initialExercise} from "./engine";
import {maintainSimulatorRecords, eraseSimulatorLearner, RETENTION_DAYS, type RetentionConnection} from "./server/retention";
function fixture(results: unknown[][]) {
  const calls: {sql: string; values: (string | number | null)[]}[] = [];
  const connection: RetentionConnection = {async execute(sql, values) {calls.push({sql, values}); return [sql.startsWith("SELECT") ? results.shift() ?? [] : {affectedRows: 1}, []];}};
  return {connection, calls};
}
const row = {id: "expired", owner_id: "mentor", owner_name: "Mentor", title: "Archived exercise", created_at: 1, updated_at: 1, tick_at: 1, content_revision: 1, snapshot: JSON.stringify(initialExercise("expired")), staff_seat: null, mentee_seat: null};
test("retention dry run selects only inactive links and preferences; replay and attempt details never expire", async () => {
  const f = fixture([[row], [{id: "unused"}]]), now = 2_000_000_000_000;
  assert.deepEqual(await maintainSimulatorRecords(f.connection, now), {expiredSessions: 1, clearedAttemptDetails: 0, expiredPreferences: 1, apply: false});
  assert.ok(f.calls.every(c => c.sql.startsWith("SELECT")));
  assert.deepEqual(f.calls[0].values, [now - RETENTION_DAYS.inactiveSession * 86_400_000, now, now]);
  assert.match(f.calls[0].sql, /staff_seat IS NULL/); assert.match(f.calls[0].sql, /mentee_seat IS NULL/);
  assert.ok(f.calls.every(c => !c.sql.includes("simulator_attempts") && !c.sql.includes("simulator_replays")));
});
test("expiry archives an older session before deleting its link, retaining the attempt snapshot and feedback", async () => {
  const f = fixture([[row], [{id: "unused"}], []]);
  await maintainSimulatorRecords(f.connection, 2_000_000_000_000, true);
  const writes = f.calls.filter(c => !c.sql.startsWith("SELECT"));
  const archive = writes.findIndex(c => c.sql.startsWith("INSERT INTO simulator_replays"));
  const close = writes.findIndex(c => c.sql.startsWith("UPDATE simulator_replays SET status"));
  const remove = writes.findIndex(c => c.sql.startsWith("DELETE FROM simulator_sessions"));
  assert.ok(archive >= 0 && close > archive && remove > close);
  assert.equal(writes[close].values[0], "expired");
  assert.equal(writes[archive].values.at(-1), 1, "pre-recording exercise is labelled partial");
  assert.ok(writes.some(c => /a.result=JSON_OBJECT/.test(c.sql)));
  assert.ok(writes.every(c => !/result=NULL|feedback=''|DELETE FROM simulator_attempts|DELETE FROM simulator_replays/.test(c.sql)));
});
test("archive failure prevents deletion of the live session", async () => {
  const f = fixture([[row], []]), execute = f.connection.execute;
  f.connection.execute = async (sql, values) => {if (sql.includes("simulator_replays")) throw new Error("Archive unavailable"); return execute(sql, values);};
  await assert.rejects(maintainSimulatorRecords(f.connection, 2_000_000_000_000, true), /Archive unavailable/);
  assert.ok(f.calls.every(c => !c.sql.startsWith("DELETE")));
});
test("empty maintenance batch never writes or issues an empty IN list", async () => {
  const f = fixture([[], []]); await maintainSimulatorRecords(f.connection, 2_000_000_000_000, true);
  assert.equal(f.calls.length, 2);
});
test("explicit learner erasure previews and removes selected recordings, attempts and related links", async () => {
  const selected = [[{id: "assignment-a"}], [{id: "attempt-a", session_id: "session-a"}], [{id: "replay-a", session_id: "session-b"}]];
  const dry = fixture(structuredClone(selected)); await eraseSimulatorLearner(dry.connection, "learner-a");
  assert.equal(dry.calls.length, 3); assert.deepEqual(dry.calls[2].values, ["learner-a", "learner-a"]);
  const f = fixture(structuredClone(selected)); await eraseSimulatorLearner(f.connection, "learner-a", true);
  assert.deepEqual(f.calls.slice(3).map(c => c.values), [["session-a", "session-b"], ["replay-a"], ["attempt-a"], ["assignment-a"], ["learner-a"]]);
  assert.ok(f.calls.every(c => !c.sql.includes("simulator_scenario")));
});
test("invalid maintenance/erasure arguments and database failures fail closed", async () => {
  const f = fixture([]); await assert.rejects(eraseSimulatorLearner(f.connection, "x' OR 1=1"));
  await assert.rejects(maintainSimulatorRecords(f.connection, NaN, true)); assert.equal(f.calls.length, 0);
  await assert.rejects(maintainSimulatorRecords({execute: async () => {throw new Error("Unavailable");}}, 1000, true), /Unavailable/);
});
