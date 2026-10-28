import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {getAirport} from "./airports";
import {engineFor} from "./engine";
import {createSpawnAircraft} from "./spawn-aircraft";
import {createLocalAircraft, addLocalScenarioAircraft} from "./local-aircraft";
import {blankScenario, createScenarioExercise, scenarioSchema, seedFromAircraft} from "./scenarios";
import {exerciseSchema} from "./protocol";
import {ReplayTimeline, replayDelta} from "./replays";
import {advanceScenario} from "./scenario-engine";
import {TerrainImpacts} from "./server/terrain-impacts";
import type {DepartureAirport} from "./departure-airports";
const origin: DepartureAirport = {icao: "TEST", name: "Nearby", elevation: 250, runways: [{id: "09", threshold: {x: 8, y: 0}, departure: {x: 9, y: 0}}]};
function fly(state: ReturnType<ReturnType<typeof engineFor>["initialExercise"]>, seconds: number) {
  const engine = engineFor(state); state.running = true;
  for (let n = 0; n < seconds; n++) state = engine.advance(state, 1);
  return state;
}
for (const mode of ["approach", "center"] as const) test(`${mode} remote runway survives scenario, live validation, replay state and initial climb`, () => {
  const definition = blankScenario({airport: "EGPH", trainingStation: `EGPH:${mode}`});
  const engine = engineFor(definition), exercise = engine.initialExercise(); exercise.aircraft = [];
  const a = createSpawnAircraft(exercise, "remote", {origin, runway: "09", airborne: false, callsign: "TEST123", type: "A320", landing: "full-stop", flight: "departure"});
  assert.deepEqual(a.position, origin.runways[0].threshold); assert.equal(a.altitude, 250); assert.equal(a.heading, 90);
  definition.aircraft = [{key: "remote", initial: true, seed: seedFromAircraft(a)}];
  const parsed = scenarioSchema.parse(JSON.parse(JSON.stringify(definition)));
  assert.equal(createScenarioExercise(parsed, "test").exercise.aircraft[0].originDeparture?.icao, "TEST");
  const result = engine.applyEnvelope(exercise, {id: randomUUID(), time: 0, action: {kind: "spawn", aircraft: a}});
  assert.equal(result.error, undefined); const initial = structuredClone(result.state);
  const moved = fly(result.state, 120); assert.equal(initial.aircraft[0].originDeparture?.phase, "roll");
  assert.ok(moved.aircraft[0].altitude > 1250); assert.equal(moved.aircraft[0].heading, 90);
  assert.equal(exerciseSchema.safeParse(JSON.parse(JSON.stringify(moved))).success, true);
  const replay = new ReplayTimeline(initial, [{sequence: 1, at: 120, delta: replayDelta(initial, moved), interpolate: false}]);
  assert.deepEqual(replay.at(120).aircraft[0].originDeparture, moved.aircraft[0].originDeparture);
});
test("Ground & Tower departure climbs to controlled-airport overhead altitude then turns toward the airport", () => {
  const selection = {airport: "EGPH", trainingStation: "EGPH:local"}; const engine = engineFor(selection);
  const a = createLocalAircraft(selection, "local", {origin, placement: "takeoff", callsign: "TEST123", type: "A320", runway: "09", distance: 5, leg: "downwind", hand: "left", height: 1500, speed: "auto", heading: 90, landing: "full-stop", flight: "departure", frequency: "tower"});
  const definition = addLocalScenarioAircraft(blankScenario(selection), a, undefined, 0);
  const parsed = scenarioSchema.parse(JSON.parse(JSON.stringify(definition)));
  let state = createScenarioExercise(parsed, "test").exercise; state = fly(state, 150);
  assert.equal(state.aircraft[0].altitude, getAirport(selection).elevation + 1500);
  assert.equal(state.aircraft[0].originDeparture?.phase, "overhead");
  assert.notEqual(state.aircraft[0].heading, 90);
  assert.equal(exerciseSchema.safeParse(JSON.parse(JSON.stringify(state))).success, true);
});


test("scheduled Ground & Tower departures retain their origin and an explicit heading overrides the overhead flight", () => {
  const selection = {airport: "EGPH", trainingStation: "EGPH:local"}, engine = engineFor(selection);
  const a = createLocalAircraft(selection, "local", {origin, placement: "takeoff", callsign: "TEST123", type: "A320", runway: "09", distance: 5, leg: "downwind", hand: "left", height: 1500, speed: "auto", heading: 90, landing: "full-stop", flight: "departure", frequency: "tower"});
  const definition = scenarioSchema.parse(addLocalScenarioAircraft(blankScenario(selection), a, undefined, 2));
  const created = createScenarioExercise(definition, "test"); created.exercise.running = true;
  let state = created.exercise;
  for (let t = 0; t < 5; t++) state = advanceScenario(state, created.runtime, 1, t * 1000).exercise;
  assert.equal(state.aircraft[0].originDeparture?.icao, "TEST");
  state = fly(state, 100);
  const sent = engine.applyEnvelope(state, {id: randomUUID(), time: 1000, action: {kind: "maneuver", aircraftId: state.aircraft[0].id, command: {type: "heading", value: 180}}});
  assert.equal(sent.error, undefined); assert.equal(sent.state.aircraft[0].originDeparture, undefined);
});

test("Ground & Tower rejects a departure airport above the overhead altitude", () => {
  const high = {...origin, elevation: getAirport({airport: "EGPH"}).elevation + 1501};
  assert.throws(() => createLocalAircraft({airport: "EGPH", trainingStation: "EGPH:local"}, "local", {origin: high, placement: "takeoff", callsign: "TEST123", type: "A320", runway: "09", distance: 5, leg: "downwind", hand: "left", height: 1500, speed: "auto", heading: 90, landing: "full-stop", flight: "departure", frequency: "tower"}), /overhead altitude/);
});

for (const type of ["C172", "B77W"]) test(`${type} rotates and climbs on an automatic Ground & Tower departure`, () => {
  const selection = {airport: "EGPH", trainingStation: "EGPH:local"};
  const a = createLocalAircraft(selection, "local", {origin, placement: "takeoff", callsign: "TEST123", type, runway: "09", distance: 5, leg: "downwind", hand: "left", height: 1500, speed: "auto", heading: 90, landing: "full-stop", flight: "departure", frequency: "tower"});
  const state = engineFor(selection).initialExercise(); state.aircraft = [a];
  const moved = fly(state, 180); assert.ok(moved.aircraft[0].altitude > origin.elevation);
});

test("Ground & Tower heading override during the climb keeps climbing", () => {
  const selection = {airport: "EGPH", trainingStation: "EGPH:local"}, engine = engineFor(selection);
  const a = createLocalAircraft(selection, "local", {origin, placement: "takeoff", callsign: "TEST123", type: "A320", runway: "09", distance: 5, leg: "downwind", hand: "left", height: 1500, speed: "auto", heading: 90, landing: "full-stop", flight: "departure", frequency: "tower"});
  const initial = engine.initialExercise(); initial.aircraft = [a];
  const climbing = fly(initial, 60); const altitude = climbing.aircraft[0].altitude;
  assert.ok(altitude > origin.elevation && altitude < getAirport(selection).elevation + 1500);
  const sent = engine.applyEnvelope(climbing, {id: randomUUID(), time: 1000, action: {kind: "maneuver", aircraftId: "local", command: {type: "heading", value: 180}}});
  assert.equal(sent.error, undefined); assert.ok(fly(sent.state, 20).aircraft[0].altitude > altitude);
});

for (const onRunway of [true, false]) test(`terrain departure exemption is ${onRunway ? "limited to the runway" : "absent outside the runway"}`, async () => {
  const selection = {airport: "EGPH", trainingStation: "EGPH:approach"}, engine = engineFor(selection), state = engine.initialExercise();
  const a = createSpawnAircraft(state, "remote", {origin, runway: "09", airborne: false, callsign: "TEST123", type: "A320", landing: "full-stop", flight: "departure"});
  a.radar!.departure!.phase = "climb"; a.position = {x: 8.5, y: onRunway ? 0 : .1}; a.altitude = 251; state.aircraft = [a]; state.running = true;
  const terrain = new TerrainImpacts(async () => 275); terrain.request(state); await new Promise<void>(resolve => setImmediate(resolve)); terrain.apply(state);
  assert.equal(state.aircraft.length, onRunway ? 1 : 0);
});


test("controlled-airport radar departure continues climbing after a heading instruction and levels on an altitude instruction", () => {
  const selection = {airport: "EGPH", trainingStation: "EGPH:approach"}, engine = engineFor(selection);
  let state = engine.initialExercise(); state.aircraft = [engine.newAircraft("radar", false)]; state = fly(state, 260);
  const before = state.aircraft[0].altitude; assert.ok(before > 5000);
  let action = engine.applyEnvelope(state, {id: randomUUID(), time: 1000, action: {kind: "maneuver", aircraftId: "radar", command: {type: "vector", heading: 180}}});
  assert.equal(action.error, undefined); state = fly(action.state, 10); assert.ok(state.aircraft[0].altitude > before);
  action = engine.applyEnvelope(state, {id: randomUUID(), time: 1000, action: {kind: "maneuver", aircraftId: "radar", command: {type: "vector", altitude: {unit: "feet", value: 10000}}}});
  assert.equal(action.error, undefined); state = fly(action.state, 400); assert.ok(Math.abs(state.aircraft[0].altitude - 10000) < 1);
});


test("radar accepts a nearby departure below a high controlled airport elevation", () => {
  const definition = blankScenario({airport: "SBBR", trainingStation: "SBBR:approach"}), engine = engineFor(definition), exercise = engine.initialExercise();
  const a = createSpawnAircraft(exercise, "remote", {origin, runway: "09", airborne: false, callsign: "TEST123", type: "A320", landing: "full-stop", flight: "departure"});
  definition.aircraft = [{key: "remote", initial: true, seed: seedFromAircraft(a)}];
  const created = createScenarioExercise(scenarioSchema.parse(definition), "test");
  const state = fly(created.exercise, 100);
  assert.ok(state.aircraft[0].altitude < getAirport(definition).elevation);
  assert.equal(exerciseSchema.safeParse(JSON.parse(JSON.stringify(state))).success, true);
});

test("Ground & Tower departures request transition once airborne and head for the overhead when cleared", () => {
  const selection = {airport: "EGPH", trainingStation: "EGPH:local"}; const engine = engineFor(selection);
  const a = createLocalAircraft(selection, "local", {origin, placement: "takeoff", callsign: "TEST123", type: "A320", runway: "09", distance: 5, leg: "downwind", hand: "left", height: 1500, speed: "auto", heading: 90, landing: "full-stop", flight: "departure", frequency: "tower", call: "transition", afterTransition: "touch-and-go", overheadRadius: 1});
  assert.equal(a.originDeparture?.callPending, true);
  let state = engine.initialExercise(); state.aircraft = []; state.autoReadback = true;
  state = engine.applyEnvelope(state, {id: randomUUID(), time: 0, action: {kind: "spawn", aircraft: a}}).state;
  assert.equal(state.messages.length, 0);
  state.running = true;
  for (let n = 0; n < 120 && !state.messages.length; n++) state = engine.autoReadbacks(engine.advance(state, 1), 1000 + n, randomUUID);
  assert.equal(state.messages[0]?.request?.id, "transition"); assert.ok(state.aircraft[0].altitude > origin.elevation + 150);
  const result = engine.applyEnvelope(state, {id: randomUUID(), time: 2000, action: {kind: "maneuver", aircraftId: "local", command: {type: "transition", altitude: 2000}}});
  assert.equal(result.error, undefined); const cleared = result.state.aircraft[0];
  assert.equal(cleared.transitionOverheadArmed, true);
  assert.ok(Math.abs(((engine.bearing(cleared.position, {x: 0, y: 0}) - cleared.targetHeading + 540) % 360) - 180) < 1);
  const quiet = createLocalAircraft(selection, "quiet", {origin, placement: "takeoff", callsign: "TEST124", type: "A320", runway: "09", distance: 5, leg: "downwind", hand: "left", height: 1500, speed: "auto", heading: 90, landing: "full-stop", flight: "departure", frequency: "tower", call: "quiet"});
  assert.equal(quiet.originDeparture?.callPending, undefined);
});
