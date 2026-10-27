import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import {engineFor} from "./engine";
import {planPushback} from "./ground-movement";
import {gatesFor, standPlacement} from "./scenarios";
import {planParkingRoute, planTaxiRoute} from "./taxi-routing";

test("KBHM mapped stands support pushback, departure routes and return to parking", () => {
  const airport = getAirport({airport: "KBHM"}), engine = engineFor({airport: "KBHM"});
  const gates = gatesFor(airport);
  assert.equal(gates.length, 27);
  assert.equal(gates.length, airport.features.filter(f => f.kind === "parking_position").length);
  for (const gate of gates) {
    const placement = standPlacement(gate.id, false, airport)!;
    if (gate.id.startsWith("10571855")) assert.deepEqual(placement.position, gate.points[0]);
    const aircraft = {...engine.newAircraft(gate.id, false), ...placement};
    for (const tail of ["north", "east", "south", "west"] as const) {
      const push = planPushback(airport, aircraft, tail);
      assert.ok(push.path, `${gate.id}: ${tail} pushback`);
      for (const runway of runwayEnds(airport))
        assert.ok(planTaxiRoute(airport, push.path.at(-1)!, runway.id).path, `${gate.id}: ${tail} to ${runway.id}`);
    }
    const parking = planParkingRoute(airport, {x: -.12, y: -.14}, gate.id);
    assert.ok(parking.path, `${gate.id}: parking route`);
    assert.deepEqual(parking.path.at(-1), placement.position);
  }
});

test("KBHM saved exercises retain both previous airport snapshots and stand placement", () => {
  const old = getAirport({airport: "KBHM", airportDataVersion: "002b7a49235ca80b4c3523184cd259ac2506ef9a693b01a0bfa9cfc1d48725b7"});
  const original = getAirport({airport: "KBHM", airportDataVersion: "d8cd867d9600e01e1c3bd7b7377a32be107b9bfa6d4f6a255630539d7114040c"});
  assert.equal(gatesFor(old).length, 3);
  assert.deepEqual(standPlacement("1057185560", false, old)!.position, old.features.find(f => f.id === "1057185560")!.points.at(-1));
  assert.notEqual(original.dataVersion, old.dataVersion);
});
