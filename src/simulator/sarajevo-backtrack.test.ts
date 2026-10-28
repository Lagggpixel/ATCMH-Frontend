import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {getAirport} from "./airports";
import {backTaxiRoute} from "./command-ground";
import {engineFor} from "./engine";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Sarajevo runway 11 back-taxi needs an explicit Tower instruction at the 29-end hold", () => {
  const airport = getAirport({airport: "LQSA"}), engine = engineFor({airport: "LQSA"}), state = engine.initialExercise();
  const start = standPlacement(gatesFor(airport)[0].id, false, airport)!.position;
  const taxi = planTaxiRoute(airport, start, "29"); assert.ok(taxi.path);
  const hold = taxi.path.at(-1)!, aircraft = engine.newAircraft("backtrack", false);
  assert.equal(hold.runway, "29");
  assert.equal(planTaxiRoute(airport, start, "11").path, undefined);
  Object.assign(aircraft, {position: {...hold}, mode: "parked", frequency: "ground", speed: 0, targetSpeed: 0, runway: "11"});
  assert.ok(backTaxiRoute(airport, aircraft, "11", false).error);
  aircraft.frequency = "tower";
  const entry = backTaxiRoute(airport, aircraft, "11", false); assert.ok(entry.path);
  assert.deepEqual(entry.path.at(-1), airport.runways![0].ends.find(end => end.id === "11")!.point);
  assert.ok(backTaxiRoute(airport, {...aircraft, position: start}, "11", false).error);
  const overlapping = {...airport, runways: [...airport.runways!, {...airport.runways![0], id: "overlap"}]};
  assert.ok(backTaxiRoute(overlapping, aircraft, "11", false).error);
  state.aircraft = [aircraft]; state.running = true; state.autoReadback = true;
  const result = engine.applyEnvelope(state, {id: randomUUID(), time: 0, action: {kind: "maneuver", aircraftId: aircraft.id, command: {type: "atc", action: "back-taxi", runway: "11", lineup: true}}});
  assert.equal(result.error, undefined); let next = result.state;
  for (let i = 0; i < 1200 && !(next.aircraft[0].mode === "lineup" && next.aircraft[0].holding); i++) next = engine.advance(next, 1);
  assert.equal(next.aircraft[0].mode, "lineup"); assert.equal(next.aircraft[0].holding, true);
  assert.ok(Math.hypot(next.aircraft[0].position.x - entry.path.at(-1)!.x, next.aircraft[0].position.y - entry.path.at(-1)!.y) < .003);
});


test("every Sarajevo stand reaches the mapped 29-end hold for a later back-taxi", () => {
  const airport = getAirport({airport: "LQSA"}), engine = engineFor({airport: "LQSA"});
  for (const stand of gatesFor(airport)) {
    const start = standPlacement(stand.id, false, airport)!.position;
    const taxi = planTaxiRoute(airport, start, "29");
    assert.ok(taxi.path, `${stand.name}: ${taxi.error}`);
    const aircraft = engine.newAircraft(`stand-${stand.id}`, false);
    Object.assign(aircraft, {position: taxi.path.at(-1)!, mode: "parked", frequency: "tower", speed: 0});
    assert.ok(backTaxiRoute(airport, aircraft, "11", false).path, stand.name);
  }
});
