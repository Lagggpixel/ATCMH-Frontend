import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {buildTaxiGraph, planTaxiRoute} from "./taxi-routing";

test("Auckland shared lead-in branches are not offered as parking stands", () => {
  const airport = getAirport({airport: "NZAA", airportDataVersion: "02d0d3360655bf5c64e0b12c9501bd3ba884eb021847f2d2b1e31b4d4a6f0bab"});
  const previous = getAirport({airport: "NZAA", airportDataVersion: "efa893bef7d58d2e3ee12460c0d032f433f588297b751a3ee600d69a46f07d02"});
  const ids = ["1097805381", "1097805383", "1097805941", "1097805942", "1097806503"];
  assert.deepEqual(buildTaxiGraph(airport), buildTaxiGraph(previous));
  for (const id of ids) {
    const before = previous.features.find(feature => feature.id === id)!;
    const after = airport.features.find(feature => feature.id === id)!;
    assert.equal(before.kind, "parking_position");
    assert.ok(before.name.includes(","));
    assert.equal(after.kind, "taxilane");
    assert.deepEqual(after.points, before.points);
    assert.ok(gatesFor(previous).some(gate => gate.id === id));
    assert.ok(!gatesFor(airport).some(gate => gate.id === id));
  }
  for (const name of ["1", "3", "15", "16"]) {
    const gate = gatesFor(airport).find(candidate => candidate.name === name)!;
    const position = standPlacement(gate.id, false, airport)!.position;
    for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position, end.id).path, `${name} to ${end.id}`);
  }
});
