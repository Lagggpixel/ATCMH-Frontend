import assert from "node:assert/strict";
import test from "node:test";
import {airportList, getAirport} from "./airports";
import {engineFor} from "./engine";
import {gateAtPoint, gateTargets, placeAircraftAtGate} from "./gate-placement";
import {normalizeScenarioAircraft, seedFromAircraft, standPlacement, gatesFor} from "./scenarios";
import {planParkingRoute, planTaxiRoute} from "./taxi-routing";
import {planPushback} from "./ground-movement";

test("gate drops use mapped nose positions and preserve aircraft setup across airports", () => {
  for (const airport of airportList.filter(airport => airport.features.some(feature => feature.kind === "parking_position"))) {
    const gates = gateTargets(airport);
    if (gates.length < 2) continue;
    const spec = normalizeScenarioAircraft({key: "ground", initial: false, gateId: gates[0].id,
      seed: seedFromAircraft(engineFor({airport: airport.icao}).newAircraft("ground", false))}, airport);
    spec.seed.taxiPath = [{x: 0, y: 0, hold: true}];
    const source = structuredClone(spec), moved = placeAircraftAtGate(spec, gates[1].id, airport);
    const placement = standPlacement(gates[1].id, false, airport)!;
    assert.deepEqual(gates[1].point, placement.position);
    assert.deepEqual(moved.seed.position, placement.position);
    assert.equal(moved.seed.heading, placement.heading);
    assert.equal(moved.seed.targetHeading, placement.heading);
    assert.equal(moved.seed.mode, "parked");
    assert.equal(moved.seed.speed, 0);
    assert.equal(moved.seed.altitude, airport.elevation);
    assert.deepEqual(moved.seed.taxiPath, [], "a route from the previous gate cannot survive relocation");
    assert.equal(moved.seed.callsign, spec.seed.callsign);
    assert.equal(moved.seed.runway, spec.seed.runway);
    assert.equal(moved.initial, false);
    assert.equal(moved.key, spec.key);
    assert.deepEqual(spec, source, "dragging never mutates the saved source object");
    assert.equal(placeAircraftAtGate(spec, gates[0].id, airport), spec, "same-gate drop preserves its route");
    assert.equal(placeAircraftAtGate(spec, "unknown-gate", airport), spec);
    const airborne = {...spec, seed: seedFromAircraft(engineFor({airport: airport.icao}).newAircraft("air", true))};
    assert.equal(placeAircraftAtGate(airborne, gates[1].id, airport), airborne);
  }
});

test("drop hit testing picks the closest blue dot only within the camera-scaled radius", () => {
  const gates = [{id: "a", label: "Gate A", point: {x: 0, y: 0}}, {id: "b", label: "Gate B", point: {x: 1, y: 0}}];
  assert.equal(gateAtPoint(gates, {x: .9, y: 0}, .2)?.id, "b");
  assert.equal(gateAtPoint(gates, {x: .9, y: 0}, .05), undefined);
  assert.equal(gateAtPoint(gates, {x: .1, y: .1}, 24 / 100)?.id, "a");
  assert.equal(gateAtPoint(gates, {x: .1, y: .1}, 24 / 1000), undefined);
  assert.equal(gateAtPoint([], {x: 0, y: 0}, 10), undefined);
});

const kdal = getAirport({airport: "KDAL"}), engine = engineFor({airport: "KDAL"});

test("KDAL 13 and 15A put the nose beside the terminal, preserving the pinned map and connected routes", () => {
  const source = JSON.stringify(kdal);
  for (const name of ["13", "15A"]) {
    const gate = gatesFor(kdal).find(g => g.name === name)!;
    const placement = standPlacement(gate.id, false, kdal)!;
    assert.deepEqual(placement.position, gate.points[0]);
    assert.ok(placement.position.y > .05, "nose is at the terminal end, not the apron taxiway");
    assert.ok(placement.heading < 45 || placement.heading > 315);
    assert.deepEqual(gateTargets(kdal).find(g => g.id === gate.id)!.point, placement.position);
    const a = {...engine.newAircraft(name, false), ...placement};
    assert.ok(planPushback(kdal, a, "east").path, name);
    assert.ok(planTaxiRoute(kdal, placement.position, "31L").path, name);
    const parking = planParkingRoute(kdal, {x: -.24, y: .02}, gate.id);
    assert.ok(parking.path, parking.error);
    assert.deepEqual(parking.path!.at(-1), placement.position);
  }
  assert.equal(JSON.stringify(kdal), source);
});
