import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Auckland stands 80 and 81 use mapped stop nodes and closed stands 57–59 are not offered", () => {
  const airport = getAirport({airport: "NZAA"});
  const previous = getAirport({airport: "NZAA", airportDataVersion: "f4f2d54d7607dd4568cbd906fa79fa404ede18af0bbfddcc291ec13793345758"});
  const stands = [["81", "1192858539", -37.0076976, 174.7769188], ["80", "1192858543", -37.0074631, 174.7777607]] as const;
  const names = new Set(["80", "81", "57", "58", "59"]), gates = gatesFor(airport);
  for (const [name, id, lat, lon] of stands) {
    const matches = gates.filter(gate => gate.name === name);
    assert.equal(matches.length, 1, name);
    assert.equal(matches[0].id, id);
    const position = standPlacement(id, false, airport)!.position;
    const node = {x: (lon - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (lat - airport.origin.lat) * 60};
    assert.ok(Math.hypot(position.x - node.x, position.y - node.y) * 1852 < 1, name);
    for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position, end.id).path, `${name} to ${end.id}`);
  }
  for (const name of ["57", "58", "59"]) assert.ok(!gates.some(gate => gate.name === name));
  assert.ok(gatesFor(previous).some(gate => gate.name === "58"));
  const segments = (features: typeof airport.features) => features.filter(feature => names.has(feature.name)).flatMap(feature => feature.points.slice(1).map((point, i) => [JSON.stringify(feature.points[i]), JSON.stringify(point)].sort().join("|"))).sort();
  assert.deepEqual(segments(airport.features), segments(previous.features));
});
