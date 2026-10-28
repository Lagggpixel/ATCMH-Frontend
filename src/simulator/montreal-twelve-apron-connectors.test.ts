import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import stands from "./montreal-twelve-stands.json";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Montreal twelve estimated apron connections provide routes to mapped stands", () => {
  const airport = getAirport({airport: "CYUL", airportDataVersion: "c0859ede242ab51818cacf9d95a7c31efa8aa96a8585427e1399a2f4e9426c9a"});
  const previous = getAirport({airport: "CYUL", airportDataVersion: "f5268187c8af4819fdd9529914bff579e1fb84107cbfe2426814325f6f4409f2"});
  assert.deepEqual(airport.features.slice(0, previous.features.length), previous.features);
  assert.equal(airport.features.length, previous.features.length + stands.length);
  for (const [name, id] of stands) {
    const stand = airport.features.find(feature => feature.id === id)!;
    const connector = airport.features.find(feature => feature.id === `inferred-montreal-${name.toLowerCase()}-connector`)!;
    assert.equal(stand.name, name);
    assert.ok(!gatesFor(previous).some(gate => gate.id === id), name);
    assert.ok(gatesFor(airport).some(gate => gate.id === id), name);
    const position = standPlacement(id, false, airport)!.position;
    assert.deepEqual(position, standPlacement(id, false, previous)!.position);
    const [join, start] = connector.points, next = stand.points[1];
    assert.equal(connector.kind, "taxilane");
    assert.deepEqual(start, stand.points[0]);
    const dx = start.x - next.x, dy = start.y - next.y, ex = join.x - start.x, ey = join.y - start.y;
    assert.ok(Math.hypot(ex, ey) * 1852 < 33, name);
    assert.ok(Math.abs(dx * ey - dy * ex) < 1e-10 && dx * ex + dy * ey > 0, name);
    for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position, end.id).path, `${name} to ${end.id}`);
  }
});
