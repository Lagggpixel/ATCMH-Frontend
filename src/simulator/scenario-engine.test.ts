import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {AIRPORT, advance, applyEnvelope, newAircraft} from "./engine";
import {advanceScenario, executeScenarioEvent} from "./scenario-engine";
import {blankScenario, createScenarioExercise, scenarioFromExercise, scenarioSchema, scenarioRuntimeSchema, seedFromAircraft, standPlacement, type ScenarioDefinition} from "./scenarios";

function fixture(): ScenarioDefinition {
  const ground = newAircraft("ground", false), air = newAircraft("air", true); air.mode = "heading"; air.heading = air.targetHeading = 90;
  return {...blankScenario(), title: "Ground and inbound", instructorNotes: "Hidden assessment hint", briefing: "Control both frequencies", aircraft: [{key: "ground", initial: true, seed: seedFromAircraft(ground)}, {key: "air", initial: false, seed: seedFromAircraft(air)}], events: [
    {id: "pushback", title: "Request pushback", trigger: {type: "time", at: 0}, actions: [{type: "request", aircraftKey: "ground", label: "Request pushback", runway: "24"}]},
    {id: "arrival", title: "Arrival", trigger: {type: "time", at: 2}, actions: [{type: "spawn", aircraftKey: "air"}, {type: "request", aircraftKey: "air", label: "Inbound for landing", runway: "24"}]},
  ]};
}
test("scenario snapshots exclude runtime history and resolve fresh aircraft IDs per attempt", () => {
  const saved = createScenarioExercise(fixture(), "session", randomUUID());
  saved.exercise.aircraft[0].pending = 3; saved.exercise.aircraft[0].trail = [{x: 0, y: 0, time: 1}];
  const template = scenarioFromExercise(saved.exercise, "Capture");
  assert.equal("pending" in template.aircraft[0].seed, false); assert.equal("trail" in template.aircraft[0].seed, false);
  const next = createScenarioExercise(fixture(), "session", randomUUID());
  assert.notEqual(saved.exercise.aircraft[0].id, next.exercise.aircraft[0].id); assert.equal(next.exercise.messages.length, 0);
});
test("timed spawn runs at its boundary; requests are unread messages and do not move parked traffic", () => {
  const {runtime, exercise: initial} = createScenarioExercise(fixture(), "session", randomUUID());
  const start = {...initial, running: true}, position = {...start.aircraft[0].position};
  let result = advanceScenario(start, runtime, 3, 1000);
  assert.equal(result.changed, true); assert.equal(result.exercise.messages.length, 2);
  assert.equal(result.exercise.messages[0].read, false); assert.equal(result.exercise.aircraft[0].pending, 1);
  assert.deepEqual(result.exercise.aircraft[0].position, position); assert.equal(result.exercise.aircraft[0].mode, "parked");
  assert.equal(runtime.events.arrival.completedAt, 2);
  const air = result.exercise.aircraft.find(a => a.callsign.startsWith("Speedbird"))!;
  const seed = fixture().aircraft[1].seed;
  const spawned = {...newAircraft("expected", true), ...seed};
  const expected = advance({...start, aircraft: [spawned]}, 1).aircraft[0];
  assert.deepEqual(air.position, expected.position, "aircraft only moves during the second after its spawn, using its automatic IAS profile");
  result = advanceScenario(result.exercise, runtime, 1, 2000); assert.equal(result.exercise.messages.length, 2);
});
test("pause, reload and a ledger beyond the command retry window do not replay events", () => {
  let {runtime, exercise} = createScenarioExercise(fixture(), "session", randomUUID());
  exercise.running = true; exercise = advanceScenario(exercise, runtime, 1, 1000).exercise;
  exercise.running = false; assert.equal(advanceScenario(exercise, runtime, 5, 2000).exercise.elapsed, exercise.elapsed);
  ({runtime, exercise} = JSON.parse(JSON.stringify({runtime, exercise})));
  exercise.processed = []; exercise.running = true;
  exercise = advanceScenario(exercise, runtime, 2, 3000).exercise;
  assert.equal(exercise.messages.filter(m => /ready for pushback/.test(m.text)).length, 1);
  assert.equal(exercise.messages.length, 2);
});
test("failed batch rolls back spawn and messages; manual retry succeeds once", () => {
  const definition = fixture(); definition.aircraft[1].seed.frequency = null;
  const {runtime, exercise} = createScenarioExercise(definition, "session", randomUUID()); exercise.running = true;
  const failed = advanceScenario(exercise, runtime, 3, 1000).exercise;
  assert.equal(runtime.events.arrival.status, "blocked"); assert.equal(failed.aircraft.length, 1); assert.equal(failed.messages.length, 1);
  runtime.definition.aircraft[1].seed.frequency = "tower";
  const retried = executeScenarioEvent(failed, runtime, "arrival", 2000);
  assert.equal(retried.aircraft.length, 2); assert.equal(retried.messages.length, 2);
  assert.equal(executeScenarioEvent(retried, runtime, "arrival", 3000), retried);
});
test("conditions latch and delay on exercise time; dependent events and manual release stay ordered", () => {
  const definition = fixture(); definition.events = definition.events.slice(0, 1); definition.aircraft = definition.aircraft.slice(0, 1);
  definition.events.push({id: "tuned", title: "Tuned Tower", trigger: {type: "condition", condition: {type: "frequency", aircraftKey: "ground", frequency: "tower"}, delay: 1}, actions: [{type: "transmission", aircraftKey: "ground", text: "ready for departure"}]},
    {id: "after", title: "After tuned", trigger: {type: "condition", condition: {type: "event", eventId: "tuned"}, delay: 0}, actions: [{type: "note", text: "Assess the handoff"}]},
    {id: "manual", title: "Manual event", trigger: {type: "manual"}, actions: [{type: "note", text: "Introduce conflict"}]});
  const {runtime, exercise} = createScenarioExercise(definition, "session", randomUUID()); exercise.running = true;
  let next = advanceScenario(exercise, runtime, 1, 1000).exercise;
  next.aircraft[0].frequency = "tower"; next = advanceScenario(next, runtime, .4, 1100).exercise;
  next.aircraft[0].frequency = "ground"; next = advanceScenario(next, runtime, .6, 1200).exercise;
  assert.equal(runtime.events.tuned.status, "completed"); assert.equal(runtime.events.after.status, "completed");
  assert.equal(runtime.events.manual.status, "waiting");
  executeScenarioEvent(next, runtime, "manual", 1300); assert.equal(runtime.events.manual.status, "completed");
});
test("scenario validation rejects duplicate spawns, missing references and cyclic dependencies", () => {
  const duplicate = fixture(); duplicate.aircraft[1].initial = true;
  assert.equal(scenarioSchema.safeParse(duplicate).success, false);
  const missing = fixture(); missing.events[0].actions = [{type: "remove", aircraftKey: "missing"}];
  assert.equal(scenarioSchema.safeParse(missing).success, false);
  const cycle = fixture(); cycle.events[0].trigger = {type: "condition", condition: {type: "event", eventId: "arrival"}, delay: 0}; cycle.events[1].trigger = {type: "condition", condition: {type: "event", eventId: "pushback"}, delay: 0};
  assert.equal(scenarioSchema.safeParse(cycle).success, false);
  const pushback = fixture(); pushback.aircraft[0].seed.mode = "pushback";
  assert.equal(scenarioSchema.safeParse(pushback).success, false, "pushback needs an executed clearance and its runtime path");
});
test("late manual events remain reloadable after the authoring time limit", () => {
  const {exercise, runtime} = createScenarioExercise({...blankScenario(), events: [{id: "late", title: "Manual", trigger: {type: "manual"}, actions: [{type: "note", text: "Debrief"}]}]}, "session", randomUUID());
  exercise.elapsed = 100000;
  executeScenarioEvent(exercise, runtime, "late", Date.now());
  assert.equal(scenarioRuntimeSchema.parse(JSON.parse(JSON.stringify(runtime))).events.late.completedAt, 100000);
});
test("pushback clearance queues normally, then Readback & assign reverses slowly and stops", () => {
  let {exercise} = createScenarioExercise({...fixture(), aircraft: fixture().aircraft.slice(0, 1), events: []}, "session", randomUUID());
  const a = exercise.aircraft[0], original = {...a.position}; a.heading = a.targetHeading = 180;
  const command = {id: "clearance", time: 1, action: {kind: "command" as const, aircraftId: a.id, frequency: "ground" as const, command: {type: "pushback" as const, tail: "north" as const}, text: "Pushback approved, tail north"}};
  exercise = applyEnvelope(exercise, command).state; assert.deepEqual(exercise.aircraft[0].position, original);
  const reply = {id: "readback", time: 2, action: {kind: "pilot" as const, aircraftId: a.id, replyTo: "clearance", text: "Pushing back", assign: true}};
  exercise = applyEnvelope(exercise, reply).state; assert.equal(exercise.aircraft[0].mode, "pushback");
  exercise.running = true;
  for (let i = 0; i < 90 && exercise.aircraft[0].mode === "pushback"; i++) exercise = advance(exercise, 5);
  assert.equal(exercise.aircraft[0].mode, "parked"); assert.ok(exercise.aircraft[0].position.y > original.y + .03);
  assert.equal(exercise.aircraft[0].speed, 0); assert.equal(exercise.aircraft[0].altitude, AIRPORT.elevation);
  assert.equal(applyEnvelope(exercise, reply).state, exercise);
});
test("stand placement is an explicit mapped endpoint with reversible orientation", () => {
  const stand = AIRPORT.features.find(f => f.kind === "parking_position")!;
  assert.deepEqual(standPlacement(stand.id)!.position, stand.points.at(-1));
  assert.deepEqual(standPlacement(stand.id, true)!.position, stand.points[0]);
  assert.equal(standPlacement("unknown"), undefined);
});
