import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {engineFor} from "./engine";
import {getAirport} from "./airports";
import {createSpawnAircraft} from "./spawn-aircraft";
import {aircraftLabel, aircraftTargetLabel} from "./aircraft-label";
import {updateRouteConstraints} from "./command-navigation";
import {magneticToTrue} from "./magnetic-headings";
import {exerciseSchema} from "./protocol";
import {withFixedReadbackDelay} from "./test-exercise";
import {touchdownRadar} from "./radar";
import type {DepartureAirport} from "./departure-airports";
import type {Exercise, Instruction} from "./model";

const origin: DepartureAirport = {icao: "TEST", name: "Remote departure", elevation: 250, runways: [{id: "09", threshold: {x: 8, y: 0}, departure: {x: 9, y: 0}}]};
function fixture(station: "approach" | "center" = "approach", remote = false) {
  const engine = engineFor({trainingStation: `EGPH:${station}`});
  const state = withFixedReadbackDelay(engine.initialExercise());
  const a = createSpawnAircraft(state, "climb", {airborne: false, ...(remote ? {origin, runway: "09"} : {}), callsign: "Test 1", type: "A320", landing: "full-stop", flight: "departure"});
  a.flightPlan = []; a.cruiseAltitude = 3000;
  state.aircraft = [a]; state.running = true; state.autoReadback = true;
  return {state, engine, airport: getAirport(state)};
}
function fly(state: Exercise, seconds: number) {
  const engine = engineFor(state);
  for (let left = seconds; left > 0; left -= Math.min(left, 1)) state = engine.advance(state, Math.min(left, 1));
  return state;
}
function send(state: Exercise, command: Instruction) {
  const result = engineFor(state).applyEnvelope(state, {id: randomUUID(), time: state.elapsed * 1000, action: {kind: "command", aircraftId: "climb", frequency: state.aircraft[0].frequency!, command, text: ""}});
  assert.equal(result.error, undefined);
  return result.state;
}
function reply(state: Exercise) {
  const engine = engineFor(state);
  return engine.autoReadbacks(fly(state, 1.5), (state.elapsed + 1.5) * 1000, randomUUID);
}

for (const station of ["approach", "center"] as const) for (const remote of [false, true]) test(`${station} ${remote ? "remote" : "local"}: no-plan takeoffs climb beyond cruise with no assigned-altitude label`, () => {
  let {state} = fixture(station, remote);
  state = fly(state, 600);
  const a = state.aircraft[0];
  assert.ok(a.altitude > 10000, `climb stopped at ${a.altitude}`);
  assert.equal(a.radar!.climbUntilAssigned, true);
  assert.equal(a.radar!.targetAltitude, undefined);
  assert.doesNotMatch(aircraftLabel(a, getAirport(state), station).flight, />/);
  assert.match(aircraftTargetLabel(a, getAirport(state)), /^ALT UNRESTRICTED · HDG \d{3}° · IAS \d+KT$/);
  state = engineFor(state).restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(state))));
  const altitude = state.aircraft[0].altitude;
  assert.ok(fly(state, 30).aircraft[0].altitude > altitude);
});

test("an initial heading-only vector is Unable; refused vectors keep climbing until an altitude is accepted", () => {
  let {state} = fixture(); const airport = getAirport(state);
  state = fly(state, 100);
  const initial = state.aircraft[0], originalHeading = initial.targetHeading;
  state = reply(send(state, {type: "vector", heading: 90}));
  assert.match(state.messages.at(-1)!.text, /^Unable/);
  assert.match(state.messages.at(-1)!.unableReason!, /altitude/);
  assert.equal(state.aircraft[0].targetHeading, originalHeading);
  assert.equal(state.aircraft[0].radar!.climbUntilAssigned, true);
  assert.ok(state.aircraft[0].altitude > initial.altitude);
  state = send(state, {type: "vector", altitude: {unit: "feet", value: 10000}});
  assert.match(aircraftLabel(state.aircraft[0], airport, "approach").flight, / > 100 /);
  assert.match(aircraftTargetLabel(state.aircraft[0], airport), /^ALT UNRESTRICTED/, "pending instruction is not yet pilot guidance");
  state = reply(state);
  assert.equal(state.messages.at(-1)!.unableReason, undefined);
  assert.match(aircraftTargetLabel(state.aircraft[0], airport), /^ALT 10,000ft/);
  assert.equal(state.aircraft[0].radar!.climbUntilAssigned, undefined);
  state = reply(send(state, {type: "vector", heading: 90}));
  assert.equal(state.messages.at(-1)!.unableReason, undefined);
  assert.equal(state.aircraft[0].targetHeading, magneticToTrue(90, airport));
  state = fly(state, 600);
  assert.equal(state.aircraft[0].altitude, 10000);
});

test("removing a departure plan discards its cruise/descent target, while explicit clearances and arrivals retain their level", () => {
  const {state, airport} = fixture();
  const a = state.aircraft[0];
  a.mode = "heading"; a.altitude = 6000; delete a.radar!.departure;
  Object.assign(a.radar!, {navigation: "route", targetAltitude: {unit: "feet", value: 3000}, altitudeFromRoute: true, plannedCruiseAltitude: 10000, routeDescending: true, climbUntilAssigned: undefined});
  a.followRouteAltitudes = true;
  updateRouteConstraints(a);
  assert.equal(a.radar!.navigation, "heading");
  assert.equal(a.radar!.targetAltitude, undefined);
  assert.equal(a.radar!.plannedCruiseAltitude, undefined);
  assert.equal(a.radar!.routeDescending, undefined);
  assert.equal(a.radar!.climbUntilAssigned, true);
  assert.doesNotMatch(aircraftLabel(a, airport, "approach").flight, />/);
  assert.ok(fly(state, 30).aircraft[0].altitude > 6000);
  a.radar!.targetAltitude = {unit: "feet", value: 6000}; delete a.radar!.climbUntilAssigned;
  updateRouteConstraints(a);
  assert.equal(a.radar!.targetAltitude.value, 6000);
  assert.equal(fly(state, 30).aircraft[0].altitude, 6000);
  delete a.radar!.targetAltitude; a.radar!.flight = "arrival";
  updateRouteConstraints(a);
  assert.equal(a.radar!.climbUntilAssigned, undefined);
  assert.equal(fly(state, 30).aircraft[0].altitude, 6000);
});

test("unrestricted climb respects the aircraft performance ceiling", () => {
  const {state} = fixture(); const a = state.aircraft[0];
  a.mode = "heading"; a.altitude = 40990; delete a.radar!.departure;
  const moved = fly(state, 300).aircraft[0];
  assert.ok(moved.altitude > a.altitude);
  assert.ok(moved.altitude <= 41000);
});

test("a touch-and-go without a flight plan also climbs without an invented 5000-foot assignment", () => {
  const {state, airport} = fixture(); const a = state.aircraft[0];
  a.landing = "touch-and-go";
  touchdownRadar(a, airport, a.runway);
  assert.equal(a.radar!.targetAltitude, undefined);
  assert.equal(a.radar!.climbUntilAssigned, true);
  assert.doesNotMatch(aircraftLabel(a, airport, "approach").flight, />/);
  assert.ok(fly(state, 600).aircraft[0].altitude > 10000);
});

for (const station of ["ground", "tower", "approach", "departure", "center"] as const) test(`${station}: planned targets stay out of assigned-altitude text and trainer targets are opt-in`, () => {
  const {state, airport} = fixture(); const a = state.aircraft[0];
  Object.assign(a, {altitude: 500, groundSpeed: 180, targetHeading: magneticToTrue(90, airport), targetSpeed: 250, cruiseAltitude: 10000});
  Object.assign(a.radar!, {targetAltitude: {unit: "feet", value: 10000}, altitudeFromRoute: true, climbUntilAssigned: undefined});
  const trainee = aircraftLabel(a, airport, station);
  assert.match(trainee.flight, /^5 180KT/);
  assert.equal(trainee.targets, undefined);
  const trainer = aircraftLabel(a, airport, station, undefined, [], undefined, true);
  assert.equal(trainer.flight, trainee.flight);
  assert.equal(trainer.targets, "ALT 10,000ft · HDG 090° · IAS 250KT");
  a.radar!.targetAltitude = {unit: "flight-level", value: 240};
  assert.match(aircraftLabel(a, airport, station, undefined, [], undefined, true).targets!, /^ALT FL240/);
  a.assigned = {altitude: {unit: "feet", value: 10000}};
  assert.match(aircraftLabel(a, airport, station).flight, /^5 > 100 /);
  assert.match(aircraftLabel(a, airport, station, undefined, [], undefined, true).targets!, /^ALT FL240/, "pending assigned FL100 cannot replace active guidance");
  const restored = exerciseSchema.parse(JSON.parse(JSON.stringify(state))).aircraft[0];
  assert.match(aircraftLabel(restored, airport, station).flight, /^5 > 100 /);
});
