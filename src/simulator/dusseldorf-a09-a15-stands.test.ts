import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Düsseldorf A09 and A15 use mapped stand nodes and inferred taxi connections", () => {
  const airport = getAirport({airport: "EDDL", airportDataVersion: "cc6eff86b2acfa32fa0a2f8731401e234f8b9aaf10f351e70949b58f12165b1b"});
  const previous = getAirport({airport: "EDDL", airportDataVersion: "fefed59cd6525996fb84b35499dbbbf98744de5d8730422c5607b7ae198e4a54"});
  assert.deepEqual(airport.features.slice(0, previous.features.length), previous.features);
  assert.equal(gatesFor(airport).length, gatesFor(previous).length + 2);
  for (const [name, id, lat, lon] of [["A09", "1009877597", 51.2826486, 6.7666455], ["A15", "1009877611", 51.28067, 6.7654653]] as const) {
    const stand = gatesFor(airport).find(f => f.id === `${id}-stand`)!;
    assert.equal(stand.name, name);
    const point = standPlacement(stand.id, false, airport)!.position;
    const marker = {x: (lon - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (lat - airport.origin.lat) * 60};
    assert.ok(Math.hypot(point.x - marker.x, point.y - marker.y) * 1852 < 2, name);
    const branch = airport.features.find(f => f.id === id)!;
    assert.equal(branch.kind, "taxilane");
    assert.ok(branch.points.some(p => p.x === point.x && p.y === point.y));
    const connector = airport.features.find(f => f.id === `inferred-dusseldorf-${name.toLowerCase()}-connector`)!;
    const [join, start] = connector.points, next = stand.points[1];
    assert.deepEqual(start, stand.points[0]);
    const dx = start.x - next.x, dy = start.y - next.y, ex = join.x - start.x, ey = join.y - start.y;
    assert.ok(Math.hypot(ex, ey) * 1852 < 25, name);
    assert.ok(Math.abs(dx * ey - dy * ex) < 1e-10 && dx * ex + dy * ey > 0, name);
    for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, point, end.id).path, `${name} ${end.id}`);
  }
});
