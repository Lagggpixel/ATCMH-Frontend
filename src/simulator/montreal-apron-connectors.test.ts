import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import terminalNodes from "./montreal-gate-nodes.json";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Montreal inferred apron connections preserve mapped stands and enable routes", () => {
  const airport = getAirport({airport: "CYUL", airportDataVersion: "f5268187c8af4819fdd9529914bff579e1fb84107cbfe2426814325f6f4409f2"});
  const previous = getAirport({airport: "CYUL", airportDataVersion: "10b159bdc3d9ee0a19ad81aa601560638aac14933ebb79f92466215d995da262"});
  const names = "82 84 86 87 88 89 49 48 47 1 5A 5 10 8 6 4 2A S4 S4B S3A S3 S3B S2A S2 S2B S1A S1 S1B".split(" ");
  assert.deepEqual(airport.features.slice(0, previous.features.length), previous.features);
  assert.equal(airport.features.length, previous.features.length + names.length);
  const oldGates = gatesFor(previous), newGates = gatesFor(airport);
  for (const name of names) {
    const stand = airport.features.find(feature => feature.kind === "parking_position" && feature.name === name)!;
    const connector = airport.features.find(feature => feature.id === `inferred-montreal-${name.toLowerCase()}-connector`)!;
    assert.ok(!oldGates.some(gate => gate.id === stand.id), name);
    assert.ok(newGates.some(gate => gate.id === stand.id), name);
    const position = standPlacement(stand.id, false, airport)!.position;
    assert.deepEqual(position, standPlacement(stand.id, false, previous)!.position);
    assert.equal(connector.kind, "taxilane");
    const [join, start] = connector.points, next = stand.points[1];
    assert.deepEqual(start, stand.points[0]);
    const dx = start.x - next.x, dy = start.y - next.y, ex = join.x - start.x, ey = join.y - start.y;
    assert.ok(Math.hypot(ex, ey) * 1852 < 25, name);
    assert.ok(Math.abs(dx * ey - dy * ex) < 1e-10 && dx * ex + dy * ey > 0, name);
    for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position, end.id).path, `${name} to ${end.id}`);
  }
  for (const [name, lat, lon] of terminalNodes as [string, number, number, string][]) {
    const stand = airport.features.find(feature => feature.kind === "parking_position" && feature.name === name)!;
    const position = standPlacement(stand.id, false, airport)!.position;
    const gate = {x: (lon - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (lat - airport.origin.lat) * 60};
    assert.ok(Math.hypot(position.x - gate.x, position.y - gate.y) * 1852 < 34, name);
  }
});
