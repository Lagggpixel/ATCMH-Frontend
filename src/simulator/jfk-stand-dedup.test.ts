import assert from "node:assert/strict";
import test from "node:test";
import {getAirport} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {buildTaxiGraph, planTaxiRoute} from "./taxi-routing";

test("JFK Terminal 7 gate branches do not create extra parking positions", () => {
  const airport = getAirport({airport: "KJFK"});
  const previous = getAirport({airport: "KJFK", airportDataVersion: "e85f452a403e601743ec50c71a293c3e168f0de37dd2d77df04ce866d3a300c2"});
  const gates = gatesFor(airport);
  for (const [name, id, chartLon] of [["1", "1011144705", -73 - 47.1 / 60], ["4", "1011144699", -73 - 47 / 60]] as const) {
    assert.ok(gates.some(gate => gate.id === id && gate.name === name));
    const position = standPlacement(id, false, airport)!.position;
    const chart = {x: (chartLon - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (40 + 39 / 60 - airport.origin.lat) * 60};
    assert.ok(Math.hypot(position.x - chart.x, position.y - chart.y) * 1852 < 125, name);
    assert.ok(planTaxiRoute(airport, position, "13L").path, name);
  }
  for (const id of ["1011144700", "1011144703", "1011144704"]) {
    assert.ok(gatesFor(previous).some(gate => gate.id === id));
    assert.ok(!gates.some(gate => gate.id === id));
    const before = previous.features.find(feature => feature.id === id)!;
    const after = airport.features.find(feature => feature.id === id)!;
    assert.equal(after.kind, "taxilane");
    assert.deepEqual(after.points, before.points);
  }
  assert.deepEqual(buildTaxiGraph(airport), buildTaxiGraph(previous));
});
