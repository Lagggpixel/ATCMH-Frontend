import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Calgary stands 37 and 38 use mapped stop markers and inferred apron connections", () => {
  const airport = getAirport({airport: "CYYC"});
  const previous = getAirport({airport: "CYYC", airportDataVersion: "fa4e487817ef8962c5943bd840c3716fb24b891a927be0786dc0a08e2334536d"});
  assert.deepEqual(airport.features.slice(0, previous.features.length), previous.features);
  for (const [name, id, lat, lon, chartLat, chartLon] of [["37", "1038378846", 51.1291636, -114.0120436, 7.7, .7], ["38", "1038378841", 51.129215, -114.0136838, 7.8, .8]] as const) {
    const stand = gatesFor(airport).find(g => g.id === id)!;
    assert.equal(stand.name, name);
    const position = standPlacement(id, false, airport)!.position;
    const project = (latitude: number, longitude: number) => ({x: (longitude - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (latitude - airport.origin.lat) * 60});
    const marker = project(lat, lon), chart = project(51 + chartLat / 60, -114 - chartLon / 60);
    assert.ok(Math.hypot(position.x - marker.x, position.y - marker.y) * 1852 < 2);
    assert.ok(Math.hypot(position.x - chart.x, position.y - chart.y) * 1852 < 125);
    const connector = airport.features.find(f => f.id === `inferred-calgary-${name}-connector`)!;
    const [join, start] = connector.points, next = stand.points[1];
    assert.deepEqual(start, stand.points[0]);
    const dx = start.x - next.x, dy = start.y - next.y, ex = join.x - start.x, ey = join.y - start.y;
    assert.ok(Math.hypot(ex, ey) * 1852 < 17);
    assert.ok(Math.abs(dx * ey - dy * ex) < 1e-10 && dx * ex + dy * ey > 0);
    for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position, end.id).path, `${name} ${end.id}`);
  }
});
