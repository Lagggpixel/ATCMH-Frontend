import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Auckland stand 84 is one charted position rather than three line segments", () => {
  const airport = getAirport({airport: "NZAA"});
  const previous = getAirport({airport: "NZAA", airportDataVersion: "02d0d3360655bf5c64e0b12c9501bd3ba884eb021847f2d2b1e31b4d4a6f0bab"});
  assert.equal(gatesFor(previous).filter(gate => gate.name === "84").length, 3);
  const gates = gatesFor(airport).filter(gate => gate.name === "84");
  assert.equal(gates.length, 1);
  assert.equal(gates[0].id, "1098366781-stand-84");
  const position = standPlacement(gates[0].id, false, airport)!.position;
  const lat = -(37 + 32.15 / 3600), lon = 174 + 47 / 60 + 5.14 / 3600;
  const chart = {x: (lon - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (lat - airport.origin.lat) * 60};
  assert.ok(Math.hypot(position.x - chart.x, position.y - chart.y) * 1852 < 6);
  const line = airport.features.find(feature => feature.id === "1098366781")!;
  assert.equal(line.kind, "taxilane");
  assert.deepEqual(line.points[0], position);
  assert.deepEqual(line.points.at(-1), previous.features.find(feature => feature.id === line.id)!.points.at(-1));
  for (const id of ["1098366782", "827249121"]) {
    const before = previous.features.find(feature => feature.id === id)!;
    const after = airport.features.find(feature => feature.id === id)!;
    assert.equal(after.kind, "taxilane");
    assert.deepEqual(after.points, before.points);
  }
  for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position, end.id).path, end.id);
});
