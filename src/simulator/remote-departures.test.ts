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
import {airborne, radarGuidanceLabel, radarTakeoffAircraft, radarTrafficStateError} from "./radar";
import type {DepartureAirport} from "./departure-airports";
const origin: DepartureAirport = {icao: "TEST", name: "Nearby", elevation: 250, runways: [{id: "09", threshold: {x: 8, y: 0}, departure: {x: 9.4, y: 0}}]};
test("saved returning traffic remains airborne above a lower destination airport", () => {
  const state = engineFor({airport: "KDAL", trainingStation: "KDAL:approach"}).initialExercise();
  state.aircraft = state.aircraft.slice(0, 1);
  const a = state.aircraft[0], airport = getAirport(state);
  a.originDeparture = {icao: "TEST", runway: "09", elevation: airport.elevation + 3, threshold: {x: 8, y: 0}, departure: {x: 9, y: 0}, phase: "complete"};
  a.mode = "heading"; a.altitude = airport.elevation + 1.99; a.frequency = "unicom";
  const approach = state.radarEnvironment!.approaches[0].id;
  Object.assign(a.radar!, {flight: "return", navigation: "approach", transferred: true, captured: true, expected: approach, cleared: approach});
  delete a.radar!.departure;
  assert.equal(radarTrafficStateError(a, airport, true), null);
  assert.equal(airborne(a, airport), true);
  exerciseSchema.parse(state);
  a.altitude = airport.elevation - 1;
  assert.ok(radarTrafficStateError(a, airport, true));
  assert.equal(exerciseSchema.safeParse(state).success, false);
  a.originDeparture.elevation = airport.elevation - 100; a.altitude = airport.elevation - 50;
  assert.equal(radarTrafficStateError(a, airport, true), null, "a remote departure below the controlled airport is still airborne");
  assert.equal(airborne(a, airport), true);
});
function fly(state: ReturnType<ReturnType<typeof engineFor>["initialExercise"]>, seconds: number) {
  const engine = engineFor(state); state.running = true;
  for (let n = 0; n < seconds; n++) state = engine.advance(state, 1);
  return state;
}

function afterRunwayClimb(state: Parameters<typeof fly>[0]) {
  const engine = engineFor(state); state.running = true;
  for (let t = 0; t < 120 && state.aircraft[0].radar?.departure; t += .05) state = engine.advance(state, .05);
  assert.equal(state.aircraft[0].radar?.departure, undefined);
  return state;
}

const runwayCases = [
  {airport: "EGLL", icao: "EGMF", runway: "23", type: "A320", elevation: 420, length: .295, at: 0, fits: true},
  {airport: "EDDL", icao: "EDRA", runway: "29", type: "A320", elevation: 250, length: 1616 / 6076.1155, at: 0, fits: true},
  {airport: "EGLL", icao: "EGSQ", runway: "18", type: "A320", elevation: 36, length: .323, at: 0, fits: true},
  {airport: "TNCM", icao: "TNCS", runway: "12", type: "C208", elevation: 60, length: .2125, at: 0, fits: true},
  {airport: "KCOS", icao: "CO93", runway: "16", type: "A21N", elevation: 6700, length: .889, at: 40, fits: true},
  {airport: "KCOS", icao: "5V4", runway: "17", type: "B38M", elevation: 6450, length: .751, at: 79, fits: true},
  {airport: "KCOS", icao: "KLAA", runway: "36", type: "B738", elevation: 3705, length: 1.038, at: 0, fits: true},
  {airport: "EGLL", icao: "TEST", runway: "09", type: "A320", elevation: 250, length: 140 ** 2 / (2 * 30 * 3600), at: 0, fits: true},
  {airport: "KSAN", icao: "TEST", runway: "09", type: "A320", elevation: 250, length: 108 / 6076.1155, at: 0, fits: false},
] as const;

for (const {airport, icao, runway, type, elevation, length, at, fits} of runwayCases) {
  test(`${airport}: ${type} ${fits ? "takes off" : "rejects takeoff"} from ${icao} ${runway} at full power`, async () => {
    const definition = blankScenario({airport, trainingStation: `${airport}:approach`});
    const engine = engineFor(definition);
    const initial = engine.initialExercise();
    initial.aircraft = [];
    const short: DepartureAirport = {icao, name: icao, elevation, runways: [
      {id: runway, threshold: {x: 8, y: 0}, departure: {x: 8 + length, y: 0}},
    ]};
    const a = createSpawnAircraft(initial, "jet", {origin: short, runway, airborne: false, callsign: "TEST123", type, landing: "full-stop", flight: "return"});
    const manualSpawn = engine.applyEnvelope(initial, {id: randomUUID(), time: 0, action: {kind: "spawn", aircraft: a}});
    assert.equal(manualSpawn.error, fits ? undefined : `${icao} runway ${runway} is too short for the ${type} in Sweatbox. Choose a longer runway or start airborne.`);

    definition.aircraft = [{key: "jet", initial: at === 0, seed: seedFromAircraft(a)}];
    if (at) definition.events = [{id: "spawn", title: "Depart", trigger: {type: "time", at}, actions: [{type: "spawn", aircraftKey: "jet"}]}];
    const created = createScenarioExercise(scenarioSchema.parse(definition), "short-takeoff");
    let state = created.exercise;
    state.running = true;
    const end = at + (fits ? 45 : 2);
    for (let t = 0; t <= end; t++) state = advanceScenario(state, created.runtime, 1, t * 1000).exercise;
    if (fits) {
      assert.equal(state.aircraft.length, 1);
      assert.ok(state.aircraft[0].altitude > elevation);
      assert.equal(state.aircraft[0].takeoffOutcome, undefined);
      return;
    }
    const parked = state.aircraft[0];
    assert.equal(parked.mode, "parked");
    assert.equal(parked.takeoffOutcome, "rejected");
    assert.equal(parked.altitude, elevation);
    assert.equal(parked.speed, 0);
    assert.deepEqual(parked.position, a.position);
    assert.equal(radarGuidanceLabel(parked, state.radarEnvironment!), "Takeoff rejected · insufficient runway");
    assert.equal(state.messages.length, 0);

    state = engine.restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(state))));
    const provider = new TerrainImpacts(async () => elevation + 100);
    state = fly(state, 60);
    provider.request(state);
    await new Promise<void>(resolve => setImmediate(resolve));
    provider.apply(state);
    assert.equal(state.aircraft[0].takeoffOutcome, "rejected");
    assert.deepEqual(state.aircraft[0].position, a.position);
    assert.equal(state.collisions?.length ?? 0, 0);
    const replay = new ReplayTimeline(created.exercise, [{sequence: 1, at: state.elapsed, delta: replayDelta(created.exercise, state), interpolate: false}]);
    assert.equal(replay.at(state.elapsed).aircraft[0].takeoffOutcome, "rejected");
  });
}

test("a moving radar departure restored past the runway end brakes without rotating", () => {
  const selection = {airport: "EGLL", trainingStation: "EGLL:approach"};
  const engine = engineFor(selection), state = engine.initialExercise();
  const a = createSpawnAircraft(state, "jet", {origin, runway: "09", airborne: false, callsign: "TEST123", type: "A320", landing: "full-stop", flight: "return"});
  a.position = {x: 9.41, y: 0};
  a.speed = 140;
  state.aircraft = [a];
  const braking = fly(engine.restoreExercise(exerciseSchema.parse(state)), 1);
  assert.ok(Math.abs(braking.aircraft[0].speed - 137.5) < 1e-7, "braking uses the normal 2.5 kt/s rate");
  const stopped = fly(braking, 64).aircraft[0];
  assert.equal(stopped.mode, "parked");
  assert.equal(stopped.takeoffOutcome, "overrun");
  assert.equal(stopped.speed, 0);
  assert.equal(stopped.altitude, origin.elevation);
});

test("a light aircraft can depart from a runway that is too short for a jet", () => {
  const selection = {airport: "EGLL", trainingStation: "EGLL:approach"};
  const engine = engineFor(selection), state = engine.initialExercise();
  const short = {...origin, runways: [{id: "09", threshold: {x: 8, y: 0}, departure: {x: 8.03, y: 0}}]};
  const a = createSpawnAircraft(state, "light", {origin: short, runway: "09", airborne: false, callsign: "TEST123", type: "C172", landing: "full-stop", flight: "return"});
  state.aircraft = [];
  const jet = createSpawnAircraft(state, "jet", {origin: short, runway: "09", airborne: false, callsign: "TEST124", type: "A320", landing: "full-stop", flight: "return"});
  assert.match(engine.applyEnvelope(state, {id: randomUUID(), time: 0, action: {kind: "spawn", aircraft: jet}}).error!, /too short/);
  const added = engine.applyEnvelope(state, {id: randomUUID(), time: 0, action: {kind: "spawn", aircraft: a}});
  assert.equal(added.error, undefined);
  const climbed = fly(added.state, 45).aircraft[0];
  assert.equal(climbed.takeoffOutcome, undefined);
  assert.ok(climbed.altitude > origin.elevation);
});

test("below-sea-level remote departures save, reload and climb from actual runway elevation", () => {
  const definition = blankScenario({airport: "KSAN", trainingStation: "KSAN:approach"});
  const engine = engineFor(definition), initial = engine.initialExercise();
  const belowSea = {...origin, icao: "KNJK", elevation: -42};
  const aircraft = createSpawnAircraft(initial, "el-centro", {origin: belowSea, runway: "09", airborne: false, callsign: "TEST123", type: "A320", landing: "full-stop", flight: "return"});
  assert.equal(aircraft.altitude, -42);
  definition.aircraft = [{key: "el-centro", initial: true, seed: seedFromAircraft(aircraft)}];
  const parsed = scenarioSchema.parse(JSON.parse(JSON.stringify(definition)));
  const restored = createScenarioExercise(parsed, "negative-runway", "generation").exercise;
  assert.equal(restored.aircraft[0].originDeparture?.elevation, -42);
  exerciseSchema.parse(JSON.parse(JSON.stringify(restored)));
  const moved = fly(restored, 120);
  assert.ok(moved.aircraft[0].altitude > 1000);
  assert.equal(exerciseSchema.safeParse(JSON.parse(JSON.stringify(moved))).success, true);
  const replay = new ReplayTimeline(restored, [{sequence: 1, at: 120, delta: replayDelta(restored, moved), interpolate: false}]);
  assert.deepEqual(replay.at(120).aircraft[0].originDeparture, moved.aircraft[0].originDeparture);
  const invalid = structuredClone(aircraft); invalid.altitude = -2001;
  assert.equal(exerciseSchema.safeParse({...restored, aircraft: [invalid]}).success, false);
});
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
  const rolling = fly(result.state, 4);
  assert.equal(rolling.aircraft[0].radar?.departure?.phase, "roll");
  assert.ok(Math.abs(rolling.aircraft[0].speed - 120) < 1e-7, "A320 rolls at 30 kt/s");
  const climbing = fly(rolling, 2);
  assert.equal(climbing.aircraft[0].radar?.departure?.phase, "climb");
  assert.ok(climbing.aircraft[0].altitude > origin.elevation);
  const afterRotation = fly(climbing, 1);
  assert.ok(Math.abs(afterRotation.aircraft[0].speed - climbing.aircraft[0].speed - 2.5) < 1e-7, "normal 2.5 kt/s acceleration resumes in flight");
  const moved = fly(afterRotation, 113); assert.equal(initial.aircraft[0].originDeparture?.phase, "roll");
  assert.ok(moved.aircraft[0].altitude > 1250); assert.equal(moved.aircraft[0].heading, 90);
  assert.equal(exerciseSchema.safeParse(JSON.parse(JSON.stringify(moved))).success, true);
  const replay = new ReplayTimeline(initial, [{sequence: 1, at: 120, delta: replayDelta(initial, moved), interpolate: false}]);
  assert.deepEqual(replay.at(120).aircraft[0].originDeparture, moved.aircraft[0].originDeparture);
});
test("Ground & Tower departure climbs to controlled-airport overhead altitude then turns toward the airport", () => {
  const selection = {airport: "EGPH", trainingStation: "EGPH:local"};
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
  const rolling = fly(state, 2).aircraft[0];
  assert.equal(rolling.originDeparture?.phase, "roll");
  assert.ok(Math.abs(rolling.speed - (type === "C172" ? 36 : 48)) < 1e-7);
  const moved = fly(state, 180); assert.ok(moved.aircraft[0].altitude > origin.elevation);
});

for (const station of ["approach", "local"] as const) test(`${station}: short-runway boost gets an A320 airborne from 450 feet`, () => {
  const selection = {airport: "EGPH", trainingStation: `EGPH:${station}`};
  const engine = engineFor(selection), state = engine.initialExercise();
  const short = {...origin, runways: [{...origin.runways[0], departure: {x: 8 + 450 / 6076.1155, y: 0}}]};
  const options = {origin: short, runway: "09", callsign: "TEST123", type: "A320", landing: "full-stop", flight: "departure"} as const;
  const aircraft = station === "local"
    ? createLocalAircraft(selection, "short", {...options, placement: "takeoff", distance: 5, leg: "downwind", hand: "left", height: 1500, speed: "auto", heading: 90, frequency: "tower"})
    : createSpawnAircraft(state, "short", {...options, airborne: false});
  state.aircraft = [];
  const spawned = engine.applyEnvelope(state, {id: randomUUID(), time: 0, action: {kind: "spawn", aircraft}});
  assert.equal(spawned.error, undefined);
  const rolling = fly(spawned.state, 2);
  assert.ok(rolling.aircraft[0].speed > 60 && rolling.aircraft[0].speed <= 90, "only the short runway gets extra power");
  assert.ok(rolling.aircraft[0].position.x < short.runways[0].departure.x);
  const climbed = fly(rolling, 3).aircraft[0];
  assert.ok(climbed.altitude > short.elevation);
  assert.equal(climbed.takeoffOutcome, undefined);
});

test("Ground & Tower heading override during the climb keeps climbing", () => {
  const selection = {airport: "EGPH", trainingStation: "EGPH:local"}, engine = engineFor(selection);
  const a = createLocalAircraft(selection, "local", {origin, placement: "takeoff", callsign: "TEST123", type: "A320", runway: "09", distance: 5, leg: "downwind", hand: "left", height: 1500, speed: "auto", heading: 90, landing: "full-stop", flight: "departure", frequency: "tower"});
  const initial = engine.initialExercise(); initial.aircraft = [a];
  const climbing = fly(initial, 30); const altitude = climbing.aircraft[0].altitude;
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
  const state = fly(created.exercise, 65);
  assert.equal(state.aircraft[0].radar?.departure, undefined);
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


test("three-character departure identifiers survive scenario and exercise validation", () => {
  const shortOrigin = {...origin, icao: "ABC"};
  const selection = {airport: "EGPH", trainingStation: "EGPH:local"};
  const local = createLocalAircraft(selection, "local", {origin: shortOrigin, placement: "takeoff", callsign: "TEST123", type: "A320", runway: "09", distance: 5, leg: "downwind", hand: "left", height: 1500, speed: "auto", heading: 90, landing: "full-stop", flight: "departure", frequency: "tower"});
  const localScenario = scenarioSchema.parse(JSON.parse(JSON.stringify(addLocalScenarioAircraft(blankScenario(selection), local, undefined, 0))));
  const localExercise = createScenarioExercise(localScenario, "test").exercise;
  assert.equal(exerciseSchema.parse(localExercise).aircraft[0].originDeparture?.icao, "ABC");

  const radarScenario = blankScenario({airport: "EGPH", trainingStation: "EGPH:approach"});
  const radarExercise = engineFor(radarScenario).initialExercise(); radarExercise.aircraft = [];
  const radar = createSpawnAircraft(radarExercise, "remote", {origin: shortOrigin, runway: "09", airborne: false, callsign: "TEST123", type: "A320", landing: "full-stop", flight: "departure"});
  radarScenario.aircraft = [{key: "remote", initial: true, seed: seedFromAircraft(radar)}];
  const parsed = scenarioSchema.parse(JSON.parse(JSON.stringify(radarScenario)));
  const started = createScenarioExercise(parsed, "test").exercise;
  assert.equal(exerciseSchema.parse(started).aircraft[0].originDeparture?.icao, "ABC");
  started.aircraft[0].originDeparture!.icao = "AB";
  assert.equal(exerciseSchema.safeParse(started).success, false);
});


test("departure airport markers sequence to the outbound leg after the runway climb", () => {
  const selection = {airport: "EGPH", trainingStation: "EGPH:approach"}, engine = engineFor(selection);
  const cases = [
    {name: "TEST", x: 8.4, next: 1},
    {name: "START", x: 8.4, next: 1},
    {name: "FIX", x: 8.4, next: 0},
    {name: "TEST", x: 20, next: 0},
  ];
  for (const entry of cases) {
    const state = engine.initialExercise();
    const a = createSpawnAircraft(state, "remote", {origin, runway: "09", airborne: false, callsign: "TEST123", type: "A320", landing: "full-stop", flight: "departure"});
    a.flightPlan = [{name: entry.name, x: entry.x, y: 0}, {name: "OUTBOUND", x: 30, y: 0}];
    a.radar!.navigation = "route"; state.aircraft = [a];
    const climbed = afterRunwayClimb(state), flown = climbed.aircraft[0];
    assert.equal(flown.radar!.routeIndex, entry.next, entry.name);
    if (entry.next === 1) {
      const outbound = fly(climbed, 1).aircraft[0];
      assert.ok(outbound.targetHeading > 45 && outbound.targetHeading < 135, "tracks outbound");
    }
  }
});

test("departure sequencing preserves an explicitly selected waypoint and procedure fix", () => {
  const selection = {airport: "EGPH", trainingStation: "EGPH:approach"}, engine = engineFor(selection);
  for (const procedure of [false, true]) {
    const state = engine.initialExercise();
    const a = createSpawnAircraft(state, "remote", {origin, runway: "09", airborne: false, callsign: "TEST123", type: "A320", landing: "full-stop", flight: "departure"});
    a.flightPlan = [{name: "TEST", x: 8.4, y: 0, ...(procedure ? {procedure: {key: "sid", type: "SID" as const, name: "TEST1"}} : {})}, {name: "NEXT", x: 30, y: 0}, {name: "SELECTED", x: 40, y: 0}];
    a.radar!.navigation = "route"; a.radar!.routeIndex = procedure ? 0 : 2; state.aircraft = [a];
    assert.equal(afterRunwayClimb(state).aircraft[0].radar!.routeIndex, procedure ? 0 : 2);
  }
});


test("a controlled-airport departure sequences its own airport marker", () => {
  const selection = {airport: "EGPH", trainingStation: "EGPH:approach"}, engine = engineFor(selection), state = engine.initialExercise();
  const airport = getAirport(selection), a = radarTakeoffAircraft(engine.newAircraft("local", false), airport, "24");
  a.flightPlan = [{name: "EGPH", ...a.position}, {name: "NEXT", x: a.position.x + 25, y: a.position.y + 25}];
  a.radar!.navigation = "route"; state.aircraft = [a];
  const flown = fly(state, 100).aircraft[0];
  assert.equal(flown.radar!.departure, undefined);
  assert.equal(flown.radar!.routeIndex, 1);
});
