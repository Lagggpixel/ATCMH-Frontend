import assert from "node:assert/strict";
import test from "node:test";
import {airportList, getAirport, runwayEnds} from "./airports";
import {engineFor} from "./engine";
import {EXERCISE_WEATHER, type Exercise, type Instruction} from "./model";

function kdal() {
  const airport = getAirport({airport: "KDAL"});
  const engine = engineFor({airport: "KDAL", weather: {...EXERCISE_WEATHER, windDirection: 0, windSpeed: 3}});
  const geometry = engine.runwayGeometry("31L");
  const aircraft = {...engine.newAircraft("arrival", true), callsign: "Test 553", runway: "31L", heading: geometry.heading,
    targetHeading: geometry.heading, position: {...geometry.threshold}, altitude: airport.elevation, speed: 135, targetSpeed: 135,
    clearedToLand: true, clearedForOption: true, landing: "touch-and-go" as const};
  let serial = 0;
  const state: Exercise = {...engine.initialExercise(), aircraft: [aircraft], running: true, autoReadback: true};
  const tick = (state: Exercise) => engine.autoReadbacks(engine.advance(state, 1), 1000, () => `radio-${++serial}`);
  const command = (state: Exercise, instruction: Instruction) => {
    const result = engine.applyEnvelope(state, {id: `command-${++serial}`, time: 1000,
      action: {kind: "command", aircraftId: aircraft.id, command: instruction, text: "Test clearance", frequency: "tower"}});
    assert.equal(result.error, undefined);
    return result.state;
  };
  const along = (state: Exercise) => {
    const a = state.aircraft[0];
    return (a.position.x - geometry.threshold.x) * geometry.vector.x + (a.position.y - geometry.threshold.y) * geometry.vector.y;
  };
  return {airport, engine, geometry, state, tick, command, along};
}

for (const airport of airportList) test(`${airport.icao}: final descent does not depend on landing clearance or Automatic`, () => {
  const engine = engineFor({airport: airport.icao, weather: {...EXERCISE_WEATHER, windSpeed: 0}});
  for (const end of runwayEnds(airport)) for (const autoReadback of [false, true]) {
    const g = engine.runwayGeometry(end.id);
    const aircraft = {...engine.newAircraft("arrival", true), runway: end.id, heading: g.heading, targetHeading: g.heading,
      position: {x: g.threshold.x - g.vector.x * 2, y: g.threshold.y - g.vector.y * 2}, altitude: airport.elevation + 700,
      clearedToLand: false, clearedForOption: false, speed: 135, targetSpeed: 135};
    const state: Exercise = {...engine.initialExercise(), running: true, autoReadback, aircraft: [aircraft]};
    const next = engine.advance(state, 5).aircraft[0];
    assert.ok(next.altitude < aircraft.altitude, `${end.id}: descend before clearance`);
    assert.equal(next.mode, "pattern");
    assert.equal(next.clearedToLand, false);
    assert.equal(next.clearedForOption, false);
    assert.equal(aircraft.altitude, airport.elevation + 700, "input snapshot is unchanged");
  }
});

test("a second circuit descends before a late option clearance and completes another touch-and-go", () => {
  const h = kdal();
  let state = h.tick(h.state);
  assert.equal(state.aircraft[0].mode, "takeoff");
  assert.equal(state.aircraft[0].circuit, 1);
  assert.equal(state.aircraft[0].clearedToLand, false);
  let sent = false, readBack = false;
  for (let t = 0; t < 700; t++) {
    const a = state.aircraft[0];
    if (!sent && a.leg === "final" && h.along(state) >= -2.24) {
      assert.ok(a.altitude < h.airport.elevation + 800, "already descending when the second clearance arrives near 2.2 NM");
      state = h.command(state, {type: "land", option: true, runway: "31L"});
      assert.equal(state.messages.at(-1)!.clearanceCircuit, 1);
      sent = true;
    }
    state = h.tick(state);
    readBack ||= sent && !!state.aircraft[0].clearedForOption;
    assert.notEqual(state.aircraft[0].mode, "go-around");
    if (state.aircraft[0].circuit === 2) break;
  }
  assert.ok(sent && readBack);
  assert.equal(state.aircraft[0].circuit, 2);
  state = h.tick(state);
  assert.equal(state.aircraft[0].mode, "takeoff");
  assert.equal(state.aircraft[0].clearedToLand, false);
  assert.equal(state.aircraft[0].clearedForOption, false);
});

test("an uncleared final descends but goes around once at the runway without touching down", () => {
  const h = kdal(), g = h.geometry;
  let state = h.state;
  Object.assign(state.aircraft[0], {position: {x: g.threshold.x - g.vector.x * 3, y: g.threshold.y - g.vector.y * 3},
    altitude: h.airport.elevation + 955, clearedToLand: false, clearedForOption: false});
  let descended = false, wentAround = false;
  for (let t = 0; t < 150; t++) {
    state = h.tick(state);
    const a = state.aircraft[0];
    descended ||= a.altitude < h.airport.elevation + 900;
    assert.ok(!["rollout", "takeoff"].includes(a.mode), "no touchdown without clearance");
    if (a.mode === "go-around") {
      assert.ok(h.along(state) >= -.002, "do not go around early solely for missing clearance");
      wentAround = true;
      break;
    }
  }
  assert.ok(descended && wentAround);
  for (let t = 0; t < 10; t++) state = h.tick(state);
  assert.equal(state.messages.filter(m => m.text === "Test 553, going around").length, 1);
});

test("cancelling landing clearance on final keeps the descent but prevents touchdown", () => {
  const h = kdal(), g = h.geometry;
  let state = h.state;
  Object.assign(state.aircraft[0], {position: {x: g.threshold.x - g.vector.x * 2, y: g.threshold.y - g.vector.y * 2},
    altitude: h.airport.elevation + 640});
  state = h.command(state, {type: "cancel-landing"});
  for (let t = 0; t < 5; t++) state = h.tick(state);
  assert.equal(state.aircraft[0].clearedToLand, false);
  assert.ok(state.aircraft[0].altitude < h.airport.elevation + 640, "do not climb after cancellation");
  for (let t = 0; t < 100 && state.aircraft[0].mode !== "go-around"; t++) state = h.tick(state);
  assert.equal(state.aircraft[0].mode, "go-around");
});
