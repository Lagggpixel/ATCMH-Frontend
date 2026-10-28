import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Düsseldorf B03 and B04 use mapped stops and inferred apron links", () => {
  const airport = getAirport({airport: "EDDL"});
  const previous = getAirport({airport: "EDDL", airportDataVersion: "89d5c6b3814f2810787f463eaefa4b310247dc8cdf301187d03a68cd27513cf6"});
  assert.deepEqual(airport.features.slice(0, previous.features.length), previous.features);
  assert.equal(gatesFor(airport).length, gatesFor(previous).length + 2);
  for (const [name, id, lat, lon] of [["B03", "1009877618", 51.2804899, 6.7628656], ["B04", "1009877624", 51.2802855, 6.7622623]] as const) {
    const stand = gatesFor(airport).find(f => f.id === `${id}-stand`)!;
    assert.equal(stand.name, name);
    const branch = airport.features.find(f => f.id === id)!;
    assert.equal(branch.kind, "taxilane"); assert.deepEqual(stand.points, branch.points.slice(0, 2));
    const point = standPlacement(stand.id, false, airport)!.position;
    const marker = {x: (lon - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (lat - airport.origin.lat) * 60};
    assert.ok(Math.hypot(point.x - marker.x, point.y - marker.y) * 1852 < 2, name);
    const [join, start] = airport.features.find(f => f.id === `inferred-dusseldorf-${name.toLowerCase()}-connector`)!.points, next = stand.points[1];
    assert.deepEqual(start, stand.points[0]);
    const dx = start.x - next.x, dy = start.y - next.y, ex = join.x - start.x, ey = join.y - start.y;
    assert.ok(Math.hypot(ex, ey) * 1852 < 53, name);
    assert.ok(Math.abs(dx * ey - dy * ex) < 1e-10 && dx * ex + dy * ey > 0, name);
    for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, point, end.id).path, `${name} ${end.id}`);
  }
});
