import assert from "node:assert/strict";
import test from "node:test";
import type {Pool} from "mysql2/promise";
import {setPoolForTests, setWritePoolForTests} from "../lib/db";
import {TrainingService} from "./server/training-service";
import {SessionService} from "./server/session-service";
import {sqlSessionStore} from "./server/session-store";
import {blankScenario, seedFromAircraft} from "./scenarios";
import {newAircraft, engineFor} from "./engine";
import {airportList} from "./airports";
import {randomUUID} from "node:crypto";
import {readReplay} from "./server/replay-store";
import {ReplayTimeline} from "./replays";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;
/** Transactional SQL test double; does not connect to application databases. */
class Database {
  tables: Tables = {scenarios: [], revisions: [], attempts: [], sessions: [], preferences: [], replays: [], frames: []};
  failAttemptInsert = false;
  failSessionUpdate = false;
  failReplayInsert = false;
  private tail = Promise.resolve();
  execute = async (sql: string, values: unknown[] = []) => this.run(this.tables, sql, values);
  getConnection = async () => {
    const previous = this.tail; let release!: () => void; this.tail = new Promise<void>(resolve => {release = resolve;}); await previous;
    let tables = structuredClone(this.tables);
    return {query: async () => {}, execute: async (sql: string, values: unknown[] = []) => this.run(tables, sql, values), commit: async () => {this.tables = tables;}, rollback: async () => {tables = structuredClone(this.tables);}, release};
  };
  private run(t: Tables, raw: string, v: unknown[]): [Row[] | object, unknown[]] {
    const sql = raw.replace(/\s+/g, " ").toUpperCase(), select = (rows: Row[]) => [structuredClone(rows), []] as [Row[], unknown[]];
    if (sql.startsWith("SELECT AUTO_READBACK FROM SIMULATOR_STAFF_PREFERENCES")) return select(t.preferences.filter(r => r.account_id === v[0]));
    if (sql.startsWith("INSERT INTO SIMULATOR_STAFF_PREFERENCES")) {
      const row = t.preferences.find(r => r.account_id === v[0]);
      if (row) Object.assign(row, {auto_readback: v[1], updated_at: v[2]});
      else t.preferences.push({account_id: v[0], auto_readback: v[1], updated_at: v[2]});
      return [{affectedRows: 1}, []];
    }
    if (sql.startsWith("SELECT * FROM SIMULATOR_REPLAYS")) return select(t.replays.filter(r => sql.includes("SESSION_ID=?") ? r.session_id === v[0] : r.id === v[0] && r.ended_at !== null).sort((a,b) => Number(b.status === "recording") - Number(a.status === "recording") || Number(b.started_at) - Number(a.started_at)).slice(0,1));
    if (sql.startsWith("INSERT INTO SIMULATOR_REPLAYS")) {t.replays.push({id:v[0],session_id:v[1],attempt_id:v[2],owner_id:v[3],owner_name:v[4],title:v[5],started_at:v[6],content_revision:v[7],initial_state:v[8],last_state:v[9],participants:v[10],partial:v[11],sequence_no:0,duration:0,status:"recording",ended_at:null});return [{affectedRows:1},[]];}
    if (sql.startsWith("INSERT INTO SIMULATOR_REPLAY_FRAMES")) {if (this.failReplayInsert) throw new Error("Simulated recording failure"); t.frames.push({replay_id:v[0],sequence_no:v[1],at_seconds:v[2],delta:v[3],interpolate:v[4]});return [{affectedRows:1},[]];}
    if (sql.startsWith("UPDATE SIMULATOR_REPLAYS")) {
      const r=t.replays.find(r=>r.id===v.at(-1))!;
      if(sql.includes("SET LAST_STATE"))Object.assign(r,{last_state:v[0],sequence_no:v[1],duration:v[2],content_revision:v[3]});
      else if(sql.includes("SET PARTICIPANTS"))r.participants=v[0];
      else Object.assign(r,{status:v[0],ended_at:v[1],feedback:v[2]});
      return [{affectedRows:1},[]];
    }
    if (sql.startsWith("SELECT SEQUENCE_NO,AT_SECONDS,DELTA,INTERPOLATE")) return select(t.frames.filter(r=>r.replay_id===v[0] && Number(r.sequence_no)>Number(v[1])).sort((a,b)=>Number(a.sequence_no)-Number(b.sequence_no)).slice(0,500));
    if (sql.startsWith("INSERT INTO SIMULATOR_SCENARIOS")) t.scenarios.push({id: v[0], owner_id: v[1], version: 1, published_revision: 0, updated_at: v[2], draft: v[3], owner_name: v[4]});
    else if (sql.startsWith("SELECT S.*,R.DEFINITION AS PUBLISHED_DEFINITION")) return select(t.scenarios.map(s => ({...s,published_definition:t.revisions.find(r => r.scenario_id === s.id && r.revision === s.published_revision)?.definition ?? null})));
    else if (sql.startsWith("SELECT * FROM SIMULATOR_SCENARIOS")) return select(t.scenarios.filter(r => sql.includes("WHERE ID=?") ? r.id === v[0] : true));
    else if (sql.startsWith("UPDATE SIMULATOR_SCENARIOS SET DRAFT")) {const r = t.scenarios.find(r => r.id === v[2])!; Object.assign(r, {draft: v[0], version: Number(r.version) + 1, updated_at: v[1]});}
    else if (sql.startsWith("UPDATE SIMULATOR_SCENARIOS SET PUBLISHED")) {const r = t.scenarios.find(r => r.id === v[2])!; Object.assign(r, {published_revision: v[0], version: Number(r.version) + 1, updated_at: v[1]});}
    else if (sql.startsWith("INSERT INTO SIMULATOR_SCENARIO_REVISIONS")) t.revisions.push({scenario_id: v[0], revision: v[1], created_at: v[2], definition: v[3]});
    else if (sql.startsWith("SELECT DEFINITION FROM SIMULATOR_SCENARIO_REVISIONS")) return select(t.revisions.filter(r => r.scenario_id === v[0] && r.revision === v[1]));
   else if (sql.startsWith("INSERT INTO SIMULATOR_ATTEMPTS")) {
      if (this.failAttemptInsert) throw new Error("Simulated attempt insert failure");
      t.attempts.push({id: v[0], owner_id: v[1], scenario_id: v[2], revision: v[3], session_id: v[4], started_at: v[5], finished_at: null, status: "active", feedback: "", elapsed: 0, result: null});
    } else if (sql.startsWith("UPDATE SIMULATOR_ATTEMPTS")) {
      const finished = sql.includes("STATUS='FINISHED'"), r = t.attempts.find(r => r.id === v[finished ? 4 : 3]);
      if (r?.status === "active") Object.assign(r, {status: finished ? "finished" : sql.includes("STATUS='RESTARTED'") ? "restarted" : "ended", finished_at: v[0], feedback: finished ? v[1] : r.feedback, elapsed: v[finished ? 2 : 1], result: v[finished ? 3 : 2]});
    } else if (sql.startsWith("INSERT INTO SIMULATOR_SESSIONS")) t.sessions.push({id: v[0], owner_id: v[1], title: v[2], created_at: v[3], updated_at: v[4], tick_at: v[5], content_revision: v[6], snapshot: v[7], scenario_runtime: sql.includes("SCENARIO_RUNTIME,OWNER_NAME") ? v[8] : null, owner_name: sql.includes("SCENARIO_RUNTIME,OWNER_NAME") ? v[9] : v[8], staff_seat: null, mentee_seat: null});
    else if (sql.startsWith("SELECT SCENARIO_RUNTIME FROM SIMULATOR_SESSIONS")) return select(t.sessions.filter(r => r.id === v[0]));
    else if (sql.startsWith("SELECT * FROM SIMULATOR_SESSIONS")) return select(t.sessions.filter(r => sql.includes("ID LIKE") ? String(r.id).startsWith(String(v[0]).slice(0, -1)) : r.id === v[0]).slice(0, sql.includes("LIMIT 2") ? 2 : undefined));
    else if (sql.startsWith("SELECT ID,OWNER_ID,OWNER_NAME,TITLE,CREATED_AT")) return select(t.sessions);
    else if (sql.startsWith("UPDATE SIMULATOR_SESSIONS SET SCENARIO_RUNTIME")) {t.sessions.find(r => r.id === v[1])!.scenario_runtime = v[0];}
    else if (sql.startsWith("UPDATE SIMULATOR_SESSIONS SET UPDATED_AT")) {
      if (this.failSessionUpdate) throw new Error("Simulated session update failure");
      Object.assign(t.sessions.find(r => r.id === v[6])!, {updated_at: v[0], tick_at: v[1], content_revision: v[2], snapshot: v[3], staff_seat: v[4], mentee_seat: v[5]});
    }
    else if (sql.startsWith("DELETE FROM SIMULATOR_SESSIONS")) t.sessions = t.sessions.filter(r => !(r.id === v[0]));
    else throw new Error(`Unhandled test SQL: ${raw}`);
    return [{affectedRows: 1}, []];
  }
}
test("all airports persist through publish, pinned revision, launch, restart and replay", async () => {
  const db = new Database(), pool = db as unknown as Pool; setPoolForTests(pool); setWritePoolForTests(pool);
  const service = new TrainingService(), staff = {accountId: "10001", staff: true};
  try {
    for (const airport of airportList) {
      const definition = blankScenario({airport: airport.icao});
      definition.aircraft = [{key: "air", initial: true, seed: seedFromAircraft(engineFor(definition).newAircraft("air", true))}];
      let scenario = await service.save(staff, definition);
      scenario = await service.publish(staff, scenario.id, scenario.version);
      scenario = await service.save(staff, {...definition, trainingStation: `${airport.icao}:tower`}, scenario.id, scenario.version);
      assert.equal((await service.scenarios(staff)).find(s => s.id === scenario.id)!.published!.trainingStation, `${airport.icao}:local`);
      scenario = await service.publish(staff, scenario.id, scenario.version);
      const latest = await service.launchScenario(staff, scenario.id, 2);
      const sessions = new SessionService(sqlSessionStore), token = randomUUID();
      assert.equal((await sessions.join(staff, latest.sessionId, "staff", token)).exercise.trainingStation, `${airport.icao}:tower`);
      const started = await service.launchScenario(staff, scenario.id, 1), seat = randomUUID();
      const joined = await sessions.join(staff, started.sessionId, "staff", seat);
      assert.equal(joined.exercise.airport, airport.icao); assert.equal(joined.exercise.trainingStation, `${airport.icao}:local`);
      assert.equal(joined.exercise.airportDataVersion, airport.dataVersion);
      await service.restart(staff, started.sessionId, joined.scenario!.attemptId!);
      const resumed = await sessions.frame(staff, started.sessionId, "staff", seat);
      assert.equal(resumed.exercise.trainingStation, `${airport.icao}:local`); assert.equal(resumed.exercise.airportDataVersion, airport.dataVersion);
      await service.finish(staff, started.sessionId, "Training complete", resumed.scenario!.attemptId!);
      const replay = await readReplay(resumed.scenario!.attemptId!, 0);
      assert.equal(replay.initial!.airport, airport.icao); assert.equal(replay.replay.trainingStation, `${airport.icao}:local`);
      const foreign = blankScenario({airport: airport.icao === "EGPH" ? "EGLL" : "EGPH"});
      await assert.rejects(service.save(staff, foreign, scenario.id, scenario.version), /Clear traffic/);
    }
  } finally {setPoolForTests(undefined); setWritePoolForTests(undefined);}
});

test("scenario SQL lifecycle is atomic, pinned, shared between staff and preserves attempts", async () => {
  const db = new Database(), pool = db as unknown as Pool; setPoolForTests(pool); setWritePoolForTests(pool);
  const service = new TrainingService(), staff = {accountId: "10001", staff: true, displayName: "Mentor One"}, student = {accountId: "10002", staff: false}, other = {accountId: "10003", staff: true};
  try {
    const definition = {...blankScenario(), title: "Original", aircraft: [{key: "easy", initial: true, seed: seedFromAircraft(newAircraft("easy", false))}]};
    let scenario = await service.save(staff, definition);
    await assert.rejects(service.save(student, definition), /Moderator/);
    assert.equal((await service.scenario(other, scenario.id)).ownerName, "Mentor One");
    assert.equal((await service.scenarios(other)).length, 1);
    await assert.rejects(service.scenario(student, scenario.id), /Moderator/);
    await assert.rejects(service.save(staff, definition, scenario.id, 0), /another page/);
    scenario = await service.publish(staff, scenario.id, scenario.version);
    scenario = await service.save(other, {...definition, title: "Edited"}, scenario.id, scenario.version);
    scenario = await service.publish(other, scenario.id, scenario.version);
    assert.equal(scenario.ownerId, staff.accountId);
    assert.equal(scenario.ownerName, "Mentor One");
    const started = await service.launchScenario(other, scenario.id, 1);
    assert.equal(db.tables.attempts.length, 1);
    const sessionId = started.sessionId, firstAttempt = String(db.tables.attempts[0].id);
    const sessions = new SessionService(sqlSessionStore), control = randomUUID();
    await sessions.join(staff, sessionId, "staff", control);
    await sessions.dispatch(staff, sessionId, "staff", control, {id: randomUUID(), time: 0, action: {kind: "auto-readback", enabled: true}});
    assert.equal(db.tables.preferences.length, 0);
    // A failed snapshot write must preserve the session's existing setting.
    db.failSessionUpdate = true;
    await assert.rejects(sessions.dispatch(staff, sessionId, "staff", control, {id: randomUUID(), time: 0, action: {kind: "auto-readback", enabled: false}}), /Simulated session update/);
    db.failSessionUpdate = false;
    assert.equal(db.tables.preferences.length, 0);
    assert.equal((await sessions.frame(staff, sessionId, "staff", control)).exercise.autoReadback, true);
    await assert.rejects(service.restart(other, sessionId, firstAttempt), /Another staff/);
    await assert.rejects(service.finish(other, sessionId, "blocked", firstAttempt), /Another staff/);
    await assert.rejects(sessions.end(other, sessionId), /Another staff/);
    await sessions.leave(staff, sessionId, "staff", control);
    await sessions.join(other, sessionId, "staff", control);
    await service.restart(other, sessionId, firstAttempt);
    assert.equal((await sessions.frame(other, sessionId, "staff", control)).exercise.autoReadback, true);
    assert.equal(db.tables.attempts[0].status, "restarted"); assert.ok(db.tables.attempts[0].result);
    assert.equal(db.tables.attempts.length, 2);
    await assert.rejects(service.finish(other, sessionId, "stale feedback", firstAttempt), /already been restarted/);
    await service.restart(other, sessionId, String(db.tables.attempts[1].id));
    assert.equal(db.tables.attempts.length, 3, "restarts have no assignment attempt cap");
    const secondAttempt = String(db.tables.attempts[2].id);
    await service.finish(other, sessionId, "Good frequency transfer", secondAttempt);
    assert.equal(db.tables.attempts[2].status, "finished"); assert.equal(db.tables.attempts[2].feedback, "Good frequency transfer");
    await service.finish(other, sessionId, "duplicate cannot overwrite", secondAttempt);
    assert.equal(db.tables.attempts[2].feedback, "Good frequency transfer");
    await sessions.end(other, sessionId); assert.equal(db.tables.sessions.length, 0);
    // A failed attempt insert rolls back the session created in the same transaction.
    db.failAttemptInsert = true;
    await assert.rejects(service.launchScenario(staff, scenario.id, 2), /Simulated/);
    assert.equal(db.tables.sessions.length, 0); assert.equal(db.tables.attempts.length, 3); assert.equal(db.tables.replays.length, 3);
    db.failAttemptInsert = false;
    const adHoc = await new SessionService(sqlSessionStore).create(staff, "Ad hoc");
    const token = randomUUID(); await new SessionService(sqlSessionStore).join(staff, adHoc.id, "staff", token);
    assert.equal((await sessions.frame(staff, adHoc.id, "staff", token)).exercise.autoReadback, true);
    const captured = await service.capture(other, adHoc.id, "Captured setup"); assert.equal(captured.draft.events.length, 0);
    assert.equal("trail" in captured.draft.aircraft[0].seed, false);
  } finally {setPoolForTests(undefined); setWritePoolForTests(undefined);}
});

test("published scenario sessions accept mentee links and isolate each session", async () => {
  const db = new Database(); setPoolForTests(db as unknown as Pool); setWritePoolForTests(db as unknown as Pool);
  const staff = {accountId: "10001", staff: true, displayName: "Mentor One"}, learner = {accountId: "10002", staff: false};
  try {
    const service = new TrainingService(), sessions = new SessionService(sqlSessionStore);
    let scenario = await service.save(staff, {...blankScenario(), title: "Premade ground", aircraft: [{key: "ground", initial: true, seed: seedFromAircraft(newAircraft("seed", false))}]});
    await assert.rejects(service.launchScenario(staff, scenario.id, 1), /unavailable/);
    scenario = await service.publish(staff, scenario.id, scenario.version);
    const first = await service.launchScenario(staff, scenario.id, 1);
    const second = await service.launchScenario(staff, scenario.id, 1);
    assert.notEqual(first.sessionId, second.sessionId);
    const view = await sessions.join(learner, first.sessionId, "mentee", randomUUID());
    assert.equal(view.exercise.running, false);
    assert.equal(view.exercise.aircraft.length, 1);
    assert.equal(view.exercise.aircraft[0].mode, "parked");
    assert.equal(db.tables.sessions.length, 2);
    assert.equal(db.tables.attempts.length, 2);
  } finally {setPoolForTests(undefined); setWritePoolForTests(undefined);}
});


test("durable replays survive restart/end, sample movement, retain messages and roll back on recording failure", async () => {
  const db = new Database(); setPoolForTests(db as unknown as Pool); setWritePoolForTests(db as unknown as Pool);
  const staff = {accountId: "10001", staff: true, displayName: "Mentor"}, mentee = {accountId: "10002", staff: false, displayName: "Mentee"};
  let now = 1_000_000;
  const service = new SessionService(sqlSessionStore, () => now), control = randomUUID();
  const send = (action: import("./model").Action) => service.dispatch(staff, session.id, "staff", control, {id: randomUUID(), time: now, action});
  const session = await service.create(staff, "Replay practice");
  try {
    await service.join(staff, session.id, "staff", control);
    await service.join(mentee, session.id, "mentee", randomUUID());
    await send({kind: "play"});
    const framesAtStart = db.tables.frames.length;
    now += 200; await service.frame(staff, session.id, "staff", control);
    assert.equal(db.tables.frames.length, framesAtStart, "movement is sampled, not repeated per SSE heartbeat");
    now += 1000; const view = await service.frame(staff, session.id, "staff", control);
    assert.ok(db.tables.frames.length > framesAtStart);
    const aircraftId = view.exercise.aircraft[0].id;
    await send({kind: "pilot", aircraftId, text: "Request departure"});
    await send({kind: "publish-atis"});
    const recordingId = String(db.tables.replays[0].id);
    const beforeFailure = structuredClone(db.tables);
    db.failReplayInsert = true;
    await assert.rejects(send({kind: "pause"}), /Simulated recording failure/);
    assert.deepEqual(db.tables, beforeFailure, "live state and archive commit atomically");
    await assert.rejects(service.end(staff, session.id), /Simulated recording failure/);
    assert.equal(db.tables.sessions.length, 1, "failed archive cannot delete the live session");
    db.failReplayInsert = false;
    // A new service instance represents a server restart; persisted sampling continues.
    now += 1000; await new SessionService(sqlSessionStore, () => now).frame(staff, session.id, "staff", control);
    await service.end(staff, session.id);
    assert.equal(db.tables.sessions.length, 0); assert.equal(db.tables.replays[0].status, "ended");
    const replay = await readReplay(recordingId, 0);
    assert.ok(replay.initial); assert.ok(replay.replay.duration > 2);
    assert.deepEqual(replay.replay.participants.map(p => p.name), ["Mentor", "Mentee"]);
    assert.ok(!JSON.stringify(db.tables.replays).includes(control), "seat tokens are never archived");
    const final = new ReplayTimeline(replay.initial!, replay.frames).at(replay.replay.duration);
    assert.ok(final.messages.some(m => m.text === "Request departure")); assert.ok(final.publishedAtis.length > 0);
    assert.ok(final.aircraft[0].position.x !== replay.initial!.aircraft[0].position.x || final.aircraft[0].position.y !== replay.initial!.aircraft[0].position.y);
  } finally {setPoolForTests(undefined); setWritePoolForTests(undefined);}
});
