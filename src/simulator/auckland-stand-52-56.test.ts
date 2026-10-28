import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Auckland stands 52 and 56 use their mapped parking nodes", () => {
  const airport = getAirport({airport: "NZAA"});
  const previous = getAirport({airport: "NZAA", airportDataVersion: "ebf829c189e20601ab2b2615c94dbc990489e9929e5d8513cc2e563affb29c2d"});
  const gates = gatesFor(airport);
  for (const [name, id, lat, lon] of [["52", "1099683661", -37.0050822, 174.7942246], ["56", "1099681970", -37.0060217, 174.7947863]] as const) {
    const matches = gates.filter(gate => gate.name === name);
    assert.equal(matches.length, 1, name);
    assert.equal(matches[0].id, id);
    const position = standPlacement(id, false, airport)!.position;
    const node = {x: (lon - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (lat - airport.origin.lat) * 60};
    assert.ok(Math.hypot(position.x - node.x, position.y - node.y) * 1852 < 1, name);
    assert.deepEqual(matches[0].points, previous.features.find(feature => feature.id === id)!.points.toReversed());
    for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position, end.id).path, `${name} to ${end.id}`);
  }
  for (const id of ["1099681971", "1099681975", "1099683662", "1099683663"]) {
    const before = previous.features.find(feature => feature.id === id)!;
    const after = airport.features.find(feature => feature.id === id)!;
    assert.equal(before.kind, "parking_position");
    assert.equal(after.kind, "taxilane");
    assert.deepEqual(after.points, before.points);
    assert.ok(!gates.some(gate => gate.id === id));
  }
});
