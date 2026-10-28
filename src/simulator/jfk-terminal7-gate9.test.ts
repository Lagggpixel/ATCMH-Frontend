import assert from "node:assert/strict";
import test from "node:test";
import {getAirport} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {buildTaxiGraph, planTaxiRoute} from "./taxi-routing";

test("JFK Terminal 7 gate 9 excludes four junction branches", () => {
  const airport = getAirport({airport: "KJFK"});
  const previous = getAirport({airport: "KJFK", airportDataVersion: "be5a4e3fb3698951c8894ae3169f950c61d6c41eee4dc41f48fb24a0017475fe"});
  assert.equal(gatesFor(previous).filter(gate => gate.name === "9").length, 5);
  const matches = gatesFor(airport).filter(gate => gate.name === "9");
  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, "1011116771");
  const position = standPlacement(matches[0].id, false, airport)!.position;
  const gate = {x: (-73.7819771 - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (40.6500808 - airport.origin.lat) * 60};
  assert.ok(Math.hypot(position.x - gate.x, position.y - gate.y) * 1852 < 35);
  assert.ok(planTaxiRoute(airport, position, "13L").path);
  for (const id of ["1011116769", "1011116770", "1011116772", "1011116773"]) {
    const before = previous.features.find(feature => feature.id === id)!;
    const after = airport.features.find(feature => feature.id === id)!;
    assert.equal(after.kind, "taxilane");
    assert.deepEqual(after.points, before.points);
  }
  assert.deepEqual(buildTaxiGraph(airport), buildTaxiGraph(previous));
});
