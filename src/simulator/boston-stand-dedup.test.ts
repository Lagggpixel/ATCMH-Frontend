import assert from "node:assert/strict";
import test from "node:test";
import {getAirport} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {buildTaxiGraph, planTaxiRoute} from "./taxi-routing";

test("Boston B29 and C12 have one parking position each and retain mapped branches", () => {
  const airport = getAirport({airport: "KBOS"});
  const previous = getAirport({airport: "KBOS", airportDataVersion: "99ba0e35795d0f9a2dbd122d642376d970e4622a740c607e8c59d350fe4be714"});
  const gates = gatesFor(airport);
  for (const [name, id, oldCount] of [["B29","1007909001",3],["C12","1008253937",2]] as const) {
    assert.equal(gatesFor(previous).filter(gate => gate.name === name).length, oldCount);
    const matches = gates.filter(gate => gate.name === name);
    assert.equal(matches.length, 1, name);
    assert.equal(matches[0].id, id);
    assert.ok(planTaxiRoute(airport, standPlacement(id, false, airport)!.position, "22L").path, name);
  }
  for (const id of ["1263596755","1263596756","1008253938"]) {
    const before = previous.features.find(feature => feature.id === id)!;
    const after = airport.features.find(feature => feature.id === id)!;
    assert.equal(after.kind, "taxilane");
    assert.deepEqual(after.points, before.points);
  }
  assert.deepEqual(buildTaxiGraph(airport), buildTaxiGraph(previous));
  const c12 = standPlacement("1008253937", false, airport)!.position;
  const chart = {x: (-71 - .9 / 60 - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (42 + 22 / 60 - airport.origin.lat) * 60};
  assert.ok(Math.hypot(c12.x - chart.x, c12.y - chart.y) * 1852 < 125);
});
