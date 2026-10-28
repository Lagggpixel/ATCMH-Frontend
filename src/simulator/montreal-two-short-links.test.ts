import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Montreal stands 84A and 2 join earlier inferred connections", () => {
  const airport = getAirport({airport: "CYUL"});
  const previous = getAirport({airport: "CYUL", airportDataVersion: "5a096683b56f7776ff6c434b2ae3bda02275c07643424f97f92b40cfb9ed9d94"});
  assert.deepEqual(airport.features.slice(0, previous.features.length), previous.features);
  for (const [name, id, lat, lon, earlier] of [["84A", "1303794271", 45.4550082, -73.7549159, "inferred-montreal-84-connector"], ["2", "1303794299", 45.4579631, -73.7465655, "inferred-montreal-2a-connector"]] as const) {
    assert.ok(!gatesFor(previous).some(gate => gate.id === id));
    const stand = gatesFor(airport).find(gate => gate.id === id)!;
    assert.equal(stand.name, name);
    const position = standPlacement(id, false, airport)!.position;
    assert.deepEqual(position, standPlacement(id, false, previous)!.position);
    const marker = {x: (lon - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (lat - airport.origin.lat) * 60};
    assert.ok(Math.hypot(position.x - marker.x, position.y - marker.y) * 1852 < 2, name);
    const [start, join] = airport.features.find(f => f.id === `inferred-montreal-${name.toLowerCase()}-short-connector`)!.points;
    assert.deepEqual(start, stand.points[0]);
    assert.ok(airport.features.find(f => f.id === earlier)!.points.some(p => Math.hypot(p.x - join.x, p.y - join.y) < 1e-8));
    assert.ok(Math.hypot(start.x - join.x, start.y - join.y) * 1852 < 5);
    for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position, end.id).path, `${name} ${end.id}`);
  }
});
