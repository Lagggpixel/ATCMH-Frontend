import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {getAirport} from "./airports";
import {localPoint} from "./aviation";
import {departureAirports, type DepartureAirport} from "./departure-airports";
import {engineFor} from "./engine";
import {radarTakeoffRunwayError} from "./radar";
import {blankScenario, createScenarioExercise, scenarioSchema, seedFromAircraft} from "./scenarios";
import {decodeSession} from "./server/session-store";
import {createSpawnAircraft} from "./spawn-aircraft";
import type {Aircraft, Exercise} from "./model";

const selection = {airport: "KSAN", trainingStation: "KSAN:approach"};
const airport = getAirport(selection), engine = engineFor(selection);
const feetPerNm = 6076.1155;
const threshold = localPoint(airport, 32.8897222, -117.2469444);
// The saved audit measured 108 ft between the two endpoints and a start at the threshold.
const shortRunway = {id: "09", threshold, departure: {x: threshold.x + 108 / feetPerNm, y: threshold.y}};
const origin: DepartureAirport = {icao: "CA84", name: "Torrey Pines", elevation: 372, runways: [shortRunway]};
const length = (runway: Pick<typeof shortRunway, "threshold" | "departure">) => engine.distance(runway.threshold, runway.departure) * feetPerNm;

function fixture() {
  const id = randomUUID(), exercise = engine.initialExercise(id);
  const aircraft = createSpawnAircraft(exercise, "training-7", {origin, runway: "09", airborne: false, callsign: "United 1742", type: "A320", landing: "full-stop", flight: "return"});
  const definition = scenarioSchema.parse({...blankScenario(selection), title: "KSAN | Runway 27 | Mock",
    aircraft: [{key: aircraft.id, initial: true, seed: seedFromAircraft(aircraft)}]});
  return {id, aircraft, definition, exercise: {...exercise, aircraft: [aircraft]}};
}

function verifyTakeoff(exercise: Exercise) {
  const aircraft = exercise.aircraft[0], runway = aircraft.originDeparture!;
  assert.ok(Math.abs(length(runway) - 1500) < 1e-7);
  assert.deepEqual(aircraft.position, runway.threshold);
  assert.equal(aircraft.callsign, "United 1742");
  assert.equal(aircraft.heading, aircraft.targetHeading);
  assert.equal(radarTakeoffRunwayError(aircraft, airport), undefined);
  let flight = {...exercise, running: true};
  for (let i = 0; i < 200 && flight.aircraft[0].altitude <= origin.elevation; i++) flight = engine.advance(flight, .05);
  const lifted = flight.aircraft[0];
  assert.ok(lifted.altitude > origin.elevation);
  assert.equal(lifted.takeoffOutcome, undefined);
  assert.ok(engine.distance(lifted.position, runway.threshold) < engine.distance(runway.threshold, runway.departure));
}

test("CA84 catalogue corrects both ends of the short imported pair and preserves valid source geometry", () => {
  const row = {airportIcao: "CA84", runway: "09", threshold: shortRunway.threshold, departure: shortRunway.departure, ils: false};
  const reverse = {...row, runway: "27", threshold: row.departure, departure: row.threshold};
  const map = {airport: "KSAN", airports: [{id: "ca84", identifier: "CA84", name: origin.name, point: row.threshold, isTowered: false, elevationFeet: 372}],
    approaches: [row, reverse]};
  const corrected = departureAirports(airport, map).find(entry => entry.icao === "CA84")!;
  const [east, west] = corrected.runways;
  assert.ok(Math.abs(length(east) - 1500) < 1e-7);
  assert.ok(east.departure.x > east.threshold.x);
  assert.deepEqual(west.threshold, east.departure);
  assert.deepEqual(west.departure, east.threshold);
  const valid = {...row, departure: {x: row.threshold.x + .25, y: row.threshold.y}};
  const current = departureAirports(airport, {...map, approaches: [valid]}).find(entry => entry.icao === "CA84")!;
  assert.deepEqual(current.runways[0].departure, valid.departure);
});

test("KSAN template materializes the 108 ft departure with corrected geometry", () => {
  const {id, aircraft, definition} = fixture();
  assert.match(radarTakeoffRunwayError(aircraft, airport)!, /CA84 runway 09 is too short/);
  const {exercise, runtime} = createScenarioExercise(definition, id, randomUUID());
  verifyTakeoff(exercise);
  assert.deepEqual(runtime.definition, definition);
  assert.equal(Math.round(length(definition.aircraft[0].seed.originDeparture!)), 108);
});

test("Assigned session 2 decodes a corrected unstarted departure and preserves later snapshots", () => {
  const {id, definition, exercise} = fixture();
  const {runtime} = createScenarioExercise(definition, id, randomUUID());
  const row = {id, owner_id: "trainer", owner_name: null, title: "Assigned session 2", created_at: 1, updated_at: 1, tick_at: 1,
    content_revision: 0, snapshot: JSON.stringify(exercise), staff_seat: null, mentee_seat: null,
    scenario_runtime: JSON.stringify({...runtime, revision: 1}),
    position_state: JSON.stringify({approach: {assignment: {accountId: "trainee", assignedAt: 1, assignedBy: "trainer"}}})};
  const restored = decodeSession(row as never);
  verifyTakeoff(restored.exercise);
  assert.deepEqual(restored.scenario!.definition, JSON.parse(JSON.stringify(definition)));
  assert.equal(restored.positionState?.approach.assignment?.accountId, "trainee");

  const moving: Aircraft = {...exercise.aircraft[0], speed: 35};
  const later = {...exercise, aircraft: [moving], elapsed: 1};
  assert.deepEqual(decodeSession({...row, snapshot: JSON.stringify(later)} as never).exercise.aircraft[0], JSON.parse(JSON.stringify(moving)));
});
