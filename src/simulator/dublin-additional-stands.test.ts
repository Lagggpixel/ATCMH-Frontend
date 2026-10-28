import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";
import chart from "./dublin-additional-stand-coordinates.json";

test("Dublin additional stands match surveyed positions and documented routing limits", () => {
  const airport = getAirport({airport: "EIDW"});
  const previous = getAirport({airport: "EIDW", airportDataVersion: "b5d64c94eeb52fd26f28dc8ada37b621013e60f46a90993d7b0e6e77bd3c53c7"});
  const gates = gatesFor(airport);
  assert.equal(gatesFor(previous).length, 45);
  assert.equal(gatesFor(getAirport({airport: "EIDW", airportDataVersion: "38d403a833d586564df89b14d070e6fc0be7f371bf84521c8a3676fb1f392679"})).length, 112);
  assert.equal(gates.length, 114);
  assert.equal(chart.coordinates.length, 69);
  for (const [name, latitude, longitude] of chart.coordinates) {
    if (typeof name !== "string" || typeof latitude !== "number" || typeof longitude !== "number") throw new Error("Invalid chart reference");
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
