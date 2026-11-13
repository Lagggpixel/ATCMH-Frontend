import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {engineFor} from "./engine";
import {automaticCruiseAltitude, plannedRouteAltitude, updateRouteConstraints} from "./command-navigation";
import {EXERCISE_WEATHER, type Instruction} from "./model";
import {aircraftSchema, envelopeSchema, exerciseSchema} from "./protocol";
import {blankScenario, createScenarioExercise, scenarioSchema, seedFromAircraft} from "./scenarios";
import {decodeValue, encodeValue} from "./sweatbox-codec";
import {decodeChunks, buildCompactChunks} from "./server/replay-chunks";
import {applyReplayDelta, replayDelta} from "./replays";

const calm = {...EXERCISE_WEATHER, windSpeed: 0};
function fixture() {
  const seed = engineFor({trainingStation: "EGPH:approach"}).initialExercise(); seed.running = true; seed.weather = calm;
  const a = seed.aircraft[0]; seed.aircraft = [a];
  Object.assign(a, {position: {x: 0, y: 0}, altitude: 1000, heading: 90, targetHeading: 90, speed: 250, targetSpeed: 250, performanceProfile: "A320", followRouteAltitudes: true,
    flightPlan: [{x: 80, y: 0, name: "GOUDA", altitudeConstraint: {min: 2600, max: 2600}}, {x: 100, y: 0, name: "AVAKI", altitudeConstraint: {min: 2600, max: 2600}}]});
  a.radar = {station: "approach", navigation: "route", routeIndex: 0, climbUntilAssigned: true};
  return {a, state: seed, engine: engineFor(seed)};
}

test("Automatic selects a bounded departure cruise, while airborne arrivals retain their level", () => {
  const {a} = fixture();
  assert.equal(automaticCruiseAltitude(a), 12000);
  a.performanceProfile = "C172"; assert.equal(automaticCruiseAltitude(a), 6000);
  a.performanceProfile = "C208"; a.flightPlan[0].x = 180; assert.equal(automaticCruiseAltitude(a), 12000);
  delete a.radar!.climbUntilAssigned; a.altitude = 7500; assert.equal(automaticCruiseAltitude(a), 7500);
});

test("far-out filed departures climb to cruise, then descend and cross successive fixes at their restrictions", () => {
  const {a, engine} = fixture(); let {state} = fixture();
  state.aircraft = [a]; a.cruiseAltitude = 10000;
  let maximum = a.altitude, heldCruise = false, startedDescent = false, firstCrossed = false;
  for (let seconds = 0; seconds < 1800 && state.aircraft[0].radar!.navigation === "route"; seconds++) {
    const before = state.aircraft[0];
    state = engine.advance(state, 1); const after = state.aircraft[0];
    maximum = Math.max(maximum, after.altitude);
    if (after.altitude === 10000) heldCruise = true;
    if (after.altitude < before.altitude) {startedDescent = true; assert.ok(after.position.x > 45, "no descent across the long en-route leg");}
    if (before.radar!.routeIndex === 0 && after.radar!.routeIndex === 1) {firstCrossed = true; assert.ok(Math.abs(after.altitude - 2600) < 2, String(after.altitude));}
    if (firstCrossed) assert.ok(after.altitude <= 2601, "do not climb back to cruise after the arrival restriction");
  }
  assert.equal(maximum, 10000); assert.ok(heldCruise && startedDescent && firstCrossed);
  assert.equal(state.aircraft[0].radar!.navigation, "heading");
  assert.ok(Math.abs(state.aircraft[0].altitude - 2600) < 2);
});

test("descent planning follows the route around a dogleg and looks beyond the active fix", () => {
  const {a} = fixture(); a.altitude = 10000; a.cruiseAltitude = 10000;
  a.flightPlan = [{x: 0, y: 40}, {x: 10, y: 0, altitude: 2600}];
  assert.equal(plannedRouteAltitude(a, calm).target, 10000, "direct distance to the low fix would descend too early");
  a.flightPlan = [{x: 10, y: 0, altitudeConstraint: {max: 9000}}, {x: 12, y: 0, altitudeConstraint: {max: 2600}}];
  assert.ok(plannedRouteAltitude(a, calm).target < 9000, "the later restriction must start descent before the nearer fix");
  a.flightPlan[0].altitudeConstraint!.min = 8000;
  assert.equal(plannedRouteAltitude(a, calm).target, 8000, "never descend below an active minimum to pursue a later upper bound");
});

test("headwinds, tailwinds, descent performance and filed intercept distance affect top of descent", () => {
  const {a} = fixture(); a.altitude = 10000; a.cruiseAltitude = 10000; a.flightPlan = [{x: 28, y: 0, altitude: 2600}];
  const headwind = plannedRouteAltitude(a, {...calm, windSpeed: 50, windDirection: 90});
  const tailwind = plannedRouteAltitude(a, {...calm, windSpeed: 50, windDirection: 270});
  assert.ok(tailwind.target < headwind.target);
  const jet = plannedRouteAltitude(a, calm); a.performanceProfile = "C208";
  assert.ok(plannedRouteAltitude(a, calm).target < jet.target);
  a.radar!.filedJoin = {index: 1, point: {x: 0, y: 60}, heading: 0, turning: false};
  assert.equal(plannedRouteAltitude(a, calm).target, 10000);
});

test("minimums, maximums and windows remain crossing restrictions", () => {
  const {a} = fixture(); a.altitude = 10000; a.cruiseAltitude = 10000;
  for (const constraint of [{min: 6000}, {max: 6000}, {min: 5000, max: 6000}]) {
    a.flightPlan = [{x: 80, y: 0, altitudeConstraint: constraint}];
    assert.equal(plannedRouteAltitude(a, calm).target, 10000);
    a.flightPlan[0].x = .1;
    assert.equal(plannedRouteAltitude(a, calm).target, constraint.max ?? 10000);
  }
});

test("cruise respects aircraft ceilings and descent planning honors fixed speeds", () => {
  const {a} = fixture(); a.altitude = 10000; a.cruiseAltitude = 10000;
  a.speed = a.targetSpeed = 180; a.flightPlan = [{x: 20, y: 0, altitude: 2600}];
  const automatic = plannedRouteAltitude(a, calm); a.speedMode = "manual";
  assert.ok(plannedRouteAltitude(a, calm).target > automatic.target, "a maintained slower speed postpones descent");
  a.cruiseAltitude = 50000; a.performanceProfile = "C172"; a.flightPlan = [{x: 1000, y: 0}];
  assert.equal(plannedRouteAltitude(a, calm).cruise, 14000);
});

test("cruise and descent phase survive scenarios, snapshots and compact transport", () => {
  const {a, state, engine} = fixture(); a.cruiseAltitude = 10500;
  const definition = blankScenario({trainingStation: "EGPH:approach"}); definition.aircraft = [{key: "test", initial: true, seed: seedFromAircraft(a)}];
  const saved = scenarioSchema.parse(JSON.parse(JSON.stringify(definition)));
  assert.equal(createScenarioExercise(saved, "test", randomUUID()).exercise.aircraft[0].cruiseAltitude, 10500);
  a.altitude = 10500; a.position.x = 72; updateRouteConstraints(a, calm);
  assert.equal(a.radar!.routeDescending, true);
  const recovered = engine.restoreExercise(exerciseSchema.parse(decodeValue(encodeValue(state))));
  assert.deepEqual(plannedRouteAltitude(recovered.aircraft[0], calm), plannedRouteAltitude(a, calm));
  assert.equal(recovered.aircraft[0].radar!.plannedCruiseAltitude, 10500);
  const later = engine.advance(state, 1), frame = {sequence: 1, at: 1, delta: replayDelta(state, later), interpolate: true};
  const chunks = buildCompactChunks(state, [frame]);
  const decoded = decodeChunks(chunks.map(c => ({chunk_no: c.chunkNo, sealed: 1, data: c.data})), state)!;
  const replayed = applyReplayDelta(state, decoded[0].delta).aircraft[0];
  assert.equal(replayed.cruiseAltitude, 10500); assert.equal(replayed.radar!.routeDescending, true); assert.equal(replayed.radar!.plannedCruiseAltitude, 10500);
  const reset = engine.applyEnvelope(recovered, envelopeSchema.parse({id: randomUUID(), time: 0, action: {kind: "edit", aircraftId: a.id, patch: {cruiseAltitude: null}}}));
  assert.equal(reset.error, undefined); assert.equal(reset.state.aircraft[0].radar!.plannedCruiseAltitude, undefined); assert.equal(reset.state.aircraft[0].radar!.routeDescending, undefined);
  for (const value of [-1, 999, 1000.5, 60001]) assert.equal(aircraftSchema.safeParse({...a, cruiseAltitude: value}).success, false);
});

test("Continue as Filed retains an explicit ATC altitude through automatic cruise planning", () => {
  for (const command of [{type: "atc", action: "navigation", variant: "filed"}, {type: "expect-approach", approachId: "gps-24", navigation: "filed"}] as Instruction[]) {
    const {a, state, engine} = fixture(); a.cruiseAltitude = 10000;
    const assigned = engine.applyEnvelope(state, {id: randomUUID(), time: 0, action: {kind: "maneuver", aircraftId: a.id, command: {type: "vector", altitude: {unit: "feet", value: 6000}}}});
    const continued = engine.applyEnvelope(assigned.state, {id: randomUUID(), time: 0, action: {kind: "maneuver", aircraftId: a.id, command}});
    assert.equal(continued.error, undefined);
    const next = engine.advance(continued.state, 1).aircraft[0];
    assert.deepEqual(next.radar!.targetAltitude, {unit: "feet", value: 6000});
    assert.equal(next.radar!.altitudeFromRoute, undefined); assert.equal(next.radar!.cleared, undefined);
  }
});
