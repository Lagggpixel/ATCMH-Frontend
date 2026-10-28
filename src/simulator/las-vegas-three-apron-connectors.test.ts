import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import nodes from "./las-vegas-three-gate-nodes.json";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Las Vegas estimated apron links connect three mapped stand lines", () => {
  const airport = getAirport({airport: "KLAS", airportDataVersion: "b334ea57172fb08981da108e1d15b9c7af55190435b5a74aa6e20de33610fe02"});
  const previous = getAirport({airport: "KLAS", airportDataVersion: "62e04f3f6ce1f5398d21400cf7e67084852ae5151272b52323c0468fe12b11b3"});
  assert.deepEqual(airport.features.slice(0, previous.features.length), previous.features);
  assert.equal(airport.features.length, previous.features.length + nodes.length);
  for (const [name, id, lat, lon] of nodes as [string, string, number, number, string][]) {
    const stand = airport.features.find(feature => feature.id === id)!;
    const connector = airport.features.find(feature => feature.id === `inferred-las-${name.toLowerCase()}-connector`)!;
    assert.ok(!gatesFor(previous).some(gate => gate.id === id), name);
    assert.ok(gatesFor(airport).some(gate => gate.id === id), name);
    const position = standPlacement(id, false, airport)!.position;
    assert.deepEqual(position, standPlacement(id, false, previous)!.position);
    const terminal = {x: (lon - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (lat - airport.origin.lat) * 60};
    assert.ok(Math.hypot(position.x - terminal.x, position.y - terminal.y) * 1852 < 45, name);
    assert.equal(connector.kind, "taxilane");
    const [join, start] = connector.points, next = stand.points[1];
    assert.deepEqual(start, stand.points[0]);
    const dx = start.x - next.x, dy = start.y - next.y, ex = join.x - start.x, ey = join.y - start.y;
    assert.ok(Math.hypot(ex, ey) * 1852 < 25, name);
    assert.ok(Math.abs(dx * ey - dy * ex) < 1e-10 && dx * ex + dy * ey > 0, name);
    for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position, end.id).path, `${name} to ${end.id}`);
  }
});
