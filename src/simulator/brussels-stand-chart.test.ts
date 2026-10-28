import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Brussels mapped stands are reachable and the previous airport snapshot remains available", () => {
  const airport = getAirport({airport: "EBBR"});
  const previous = getAirport({airport: "EBBR", airportDataVersion: "69421db6e29438433234cef0c19c225d453e8b70f49a2e80d8754223836fc392"});
  const prior = getAirport({airport: "EBBR", airportDataVersion: "f86424a50391a20cc19b96443a2093753ab62c1e98be6ab071302193e3062c16"});
  const priorIds = new Set(gatesFor(prior).map(gate => gate.id));
  const gates = gatesFor(airport).filter(gate => priorIds.has(gate.id));
  assert.equal(gatesFor(previous).length, 0);
  assert.equal(gates.length, 50);
  assert.equal(new Set(gates.map(gate => gate.name)).size, 50);
  // The 2025 parking table rounds the coordinates to a tenth of a minute.
  const references: Record<string, [number, number]> = {"231": [54.0, 29.4], "233L": [54.0, 29.4], "233R": [54.0, 29.5]};
  for (const gate of gates) {
    const position = standPlacement(gate.id, false, airport)!.position;
    if (references[gate.name]) {
      const [latMinutes, lonMinutes] = references[gate.name];
      const point = {x: (4 + lonMinutes / 60 - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (50 + latMinutes / 60 - airport.origin.lat) * 60};
      assert.ok(Math.hypot(position.x - point.x, position.y - point.y) * 1852 < 125, gate.name);
    }
    for (const end of runwayEnds(airport)) {
      const route = planTaxiRoute(airport, position, end.id);
      if (end.id === "25L") assert.ok(!route.path, gate.name);
      else assert.ok(route.path, `${gate.name} to ${end.id}`);
    }
  }
});
