import assert from "node:assert/strict";
import {test, mock} from "node:test";
import {randomUUID} from "node:crypto";
import type {Pool} from "mysql2/promise";
import {setPoolForTests, setWritePoolForTests} from "../lib/db";
import {engineFor, restoreExercise} from "./engine";
import {exerciseSchema} from "./protocol";
import {advanceScenario} from "./scenario-engine";
import {blankScenario, createScenarioExercise, scenarioSchema, scenarioSchemaFor, storedScenarioSchema, scenarioRuntimeSchema, seedFromAircraft} from "./scenarios";
import {TrainingService} from "./server/training-service";
import {SessionService} from "./server/session-service";
import {createTrainingApi} from "./server/training-api";

function legacy(station = "EGPH:local") {
  const draft = blankScenario({trainingStation: station}), engine = engineFor(draft);
  draft.title = "Legacy shared flight numbers";
  draft.aircraft = ["Qatar 701 Heavy", "Norse 701 Heavy", "Norse 701 Heavy"].map((callsign, i) => ({key: `plane-${i}`, initial: i === 0, seed: seedFromAircraft({...engine.newAircraft(`seed-${i}`, station.endsWith(":approach") || station.endsWith(":center")), callsign})}));
  draft.events = [1, 2].map(i => ({id: `arrival-${i}`, title: `Arrival ${i}`, trigger: {type: "time", at: i}, actions: [{type: "spawn", aircraftKey: `plane-${i}`}]}));
  return draft;
}

for (const station of ["local", "approach", "center"]) for (const oldAttempt of [false, true]) test(`${station}: legacy scheduled aircraft keep original names after restore, old reservations ${oldAttempt}`, () => {
  const draft = legacy(`EGPH:${station}`);
  assert.equal(scenarioSchema.safeParse(draft).success, false);
  const {exercise, runtime} = createScenarioExercise(storedScenarioSchema.parse(draft), randomUUID(), randomUUID());
  if (oldAttempt) delete exercise.callsignReservations;
  let state = restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(exercise))));
  const restored = scenarioRuntimeSchema.parse(JSON.parse(JSON.stringify(runtime)));
  state.running = true;
  state = advanceScenario(state, restored, 3, 3000).exercise;
  assert.deepEqual(state.aircraft.map(a => a.callsign), draft.aircraft.map(a => a.seed.callsign));
  assert.deepEqual(Object.values(restored.events).map(e => e.status), ["completed", "completed"]);
  const engine = engineFor(state), added = {...engine.newAircraft(randomUUID(), station !== "local"), callsign: "Delta 0701"};
  assert.match(engine.applyEnvelope(state, {id: randomUUID(), time: 0, action: {kind: "spawn", aircraft: added}}).error!, /number is/);
  assert.match(engine.applyEnvelope(state, {id: randomUUID(), time: 0, action: {kind: "spawn", aircraft: {...added, id: runtime.aircraftIds["plane-1"]}}}).error!, /number is/);
  assert.match(engine.applyEnvelope(state, {id: randomUUID(), time: 0, action: {kind: "edit", aircraftId: state.aircraft[0].id, patch: {callsign: "United 701"}}}).error!, /number is/);
  assert.equal(engine.applyEnvelope(state, {id: randomUUID(), time: 0, action: {kind: "spawn", aircraft: {...added, callsign: "Delta 702"}}}).error, undefined);
  assert.equal(draft.aircraft[1].seed.callsign, "Norse 701 Heavy");
});

test("legacy draft changes preserve unchanged names but reject added/renamed collisions regardless of aircraft order", () => {
  const previous = legacy(), changed = structuredClone(previous); changed.instructorNotes = "Updated briefing";
  assert.equal(scenarioSchemaFor(previous).safeParse(changed).success, true);
  changed.aircraft[0].seed.callsign = "Delta 701";
  assert.equal(scenarioSchemaFor(previous).safeParse(changed).success, false);
  changed.aircraft[0].seed.callsign = "Delta 702";
  assert.equal(scenarioSchemaFor(previous).safeParse(changed).success, true);
  changed.aircraft.push({...structuredClone(changed.aircraft[0]), key: "new", seed: {...changed.aircraft[0].seed, callsign: "United 701"}});
  assert.equal(scenarioSchemaFor(previous).safeParse(changed).success, false);
  changed.aircraft.at(-1)!.seed.callsign = "United 703";
  assert.equal(scenarioSchemaFor(previous).safeParse(changed).success, true);
});

test("staff launch API accepts a pinned historical revision, while invalid new drafts and fields return actionable errors", async () => {
  const scenarioId = randomUUID(), sessionId = randomUUID(), actor = {accountId: "trainer", staff: true};
  const published = legacy(), latestDraft = {...structuredClone(published), title: "Unpublished change"};
  const row = {id: scenarioId, owner_id: actor.accountId, owner_name: "Trainer", is_template: 0, version: 2, published_revision: 1, updated_at: 1, draft: JSON.stringify(latestDraft), published_definition: JSON.stringify(published)};
  const writes: string[] = [];
  const execute = async (sql: string) => {
    if (sql.startsWith("SELECT definition")) return [[{definition: JSON.stringify(published)}], []];
    if (sql.startsWith("SELECT")) return [[structuredClone(row)], []];
    writes.push(sql); assert.match(sql, /^INSERT INTO simulator_attempts/); return [{affectedRows: 1}, []];
  };
  const pool = {execute, getConnection: async () => ({execute, query: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {}})} as unknown as Pool;
  setPoolForTests(pool); setWritePoolForTests(pool);
  const create = mock.method(SessionService.prototype, "create", async (_actor, title, exercise, runtime) => {
    assert.equal(title, published.title); assert.equal(exercise!.aircraft[0].callsign, "Qatar 701 Heavy");
    assert.equal(runtime!.definition.aircraft[1].seed.callsign, "Norse 701 Heavy"); return {id: sessionId};
  });
  try {
    const api = createTrainingApi(new TrainingService(), async () => actor);
    const request = (body: unknown) => new Request("https://sweatbox.test/api/simulator/training/scenarios/" + scenarioId, {method: "POST", body: JSON.stringify(body)});
    const response = await api(request({action: "launch", revision: 1}), "scenarios", scenarioId);
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), {sessionId}); assert.equal(create.mock.callCount(), 1);
    assert.equal(writes.length, 1);
    const duplicate = await api(request({draft: published}), "scenarios"); assert.equal(duplicate.status, 400);
    const body = await duplicate.json(); assert.match(body.error, /701 Heavy.*(?:callsign|number) is/); assert.match(body.error, /(?:draft\.)?aircraft/);
    const fields = await api(request({action: "launch", revision: 0}), "scenarios", scenarioId);
    assert.equal(fields.status, 400); assert.match((await fields.json()).error, /revision.*greater than 0/);
    const malformed = await api(new Request("https://sweatbox.test", {method: "POST", body: "{"}), "scenarios");
    assert.equal(malformed.status, 400); assert.match((await malformed.json()).error, /valid JSON/);
    row.draft = JSON.stringify({...latestDraft, title: ""});
    const invalidStored = await api(request({action: "launch", revision: 1}), "scenarios", scenarioId);
    assert.equal(invalidStored.status, 400); assert.match((await invalidStored.json()).error, /title/);
    assert.equal(create.mock.callCount(), 1);
  } finally {create.mock.restore(); setPoolForTests(undefined); setWritePoolForTests(undefined);}
});


test("saved scenario API accepts existing callsigns, rejects new collisions, and keeps optimistic revision checks", async () => {
  const draft = legacy("EGPH:local"), scenarioId = randomUUID(), actor = {accountId: "trainer", staff: true};
  const row = {id: scenarioId, owner_id: actor.accountId, owner_name: "Trainer", is_template: 0, version: 2, published_revision: 1, updated_at: 1, draft: JSON.stringify(draft), published_definition: JSON.stringify(draft)};
  let updates = 0;
  const execute = async (sql: string, values: unknown[] = []) => {
    if (sql.startsWith("SELECT")) return [[structuredClone(row)], []];
    assert.match(sql, /^UPDATE simulator_scenarios SET draft/); row.draft = String(values[0]); row.version++; updates++; return [{affectedRows: 1}, []];
  };
  const pool = {execute, getConnection: async () => ({execute, query: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {}})} as unknown as Pool;
  setPoolForTests(pool); setWritePoolForTests(pool);
  try {
    const api = createTrainingApi(new TrainingService(), async () => actor);
    const save = (value = draft, version = row.version) => api(new Request("https://sweatbox.test", {method: "POST", body: JSON.stringify({action: "save", draft: value, version})}), "scenarios", scenarioId);
    draft.instructorNotes = "Updated briefing";
    assert.equal((await save()).status, 200); assert.equal(updates, 1);
    assert.equal((await save(draft, 2)).status, 409);
    draft.aircraft.push({...structuredClone(draft.aircraft[0]), key: "added"});
    const collision = await save(); assert.equal(collision.status, 400); assert.match((await collision.json()).error, /701 Heavy/); assert.equal(updates, 1);
    draft.aircraft.at(-1)!.seed.callsign = "United 702";
    assert.equal((await save()).status, 200); assert.equal(updates, 2);
  } finally {setPoolForTests(undefined); setWritePoolForTests(undefined);}
});
