import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";
import chart from "./dublin-stand-coordinates.json";

test("Dublin chart-matched stands are selectable at their published nose-in positions", () => {
  const airport = getAirport({airport: "EIDW"});
  const previous = getAirport({airport: "EIDW", airportDataVersion: "99d7b522bde9858a2c471680f4ed0a3a59be4cea755129c0568312ee57d48ed4"});
  assert.equal(previous.features.filter(feature => feature.kind === "parking_position").length, 0);
  const names = new Set(chart.coordinates.map(([name]) => name));
  const gates = gatesFor(airport).filter(gate => names.has(gate.name));
  assert.equal(chart.coordinates.length, 45);
  assert.equal(gates.length, 45);
  for (const [name, latitude, longitude] of chart.coordinates) {
    assert.equal(typeof name, "string");
    assert.equal(typeof latitude, "number");
    assert.equal(typeof longitude, "number");
    if (typeof name !== "string" || typeof latitude !== "number" || typeof longitude !== "number") continue;
    const matches = gates.filter(gate => gate.name === name);
    assert.equal(matches.length, 1, name);
    const point = {x: (longitude - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (latitude - airport.origin.lat) * 60};
    const position = standPlacement(matches[0].id, false, airport)!.position;
    assert.ok(Math.hypot(position.x - point.x, position.y - point.y) * 1852 < 15, name);
    for (const end of runwayEnds(airport)) {
      const route = planTaxiRoute(airport, position, end.id);
      if (end.id === "16") assert.ok(!route.path, `${name}: runway 16 requires an explicit intersection`);
      else assert.ok(route.path, `${name} to ${end.id}`);
    }
  }
});
