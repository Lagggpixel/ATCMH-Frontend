import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import type {Point} from "./model";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

function crosses(a: Point, b: Point, c: Point, d: Point) {
  const x = b.x - a.x, y = b.y - a.y, u = d.x - c.x, v = d.y - c.y, det = x * v - y * u;
  if (Math.abs(det) < 1e-12) return false;
  const dx = c.x - a.x, dy = c.y - a.y, t = (dx * v - dy * u) / det, s = (dx * y - dy * x) / det;
  return t > 0 && t < 1 && s > 0 && s < 1;
}
test("Calgary five mapped terminal stops connect via inferred apron links", () => {
  const airport = getAirport({airport: "CYYC", airportDataVersion: "d26a3f81e95a3d78dd1f05238d77d3a0406cd07a263ecbedf895e460820c5d1e"});
  const previous = getAirport({airport: "CYYC", airportDataVersion: "63f4965f5e92fff1f359529eec97982116487639e091536d7e48e313672f4415"});
  assert.deepEqual(airport.features.slice(0, previous.features.length), previous.features);
  assert.equal(gatesFor(airport).length, gatesFor(previous).length + 5);
  for (const [name, id, lat, lon] of [["14", "1038377218", 51.1331508, -114.0140863], ["16", "1038377219", 51.1332924, -114.0148811], ["21A", "1038377237", 51.1322003, -114.012806], ["21B", "1038377238", 51.1320678, -114.0126964], ["51", "1038378881", 51.1294282, -114.0078123]] as const) {
    const stand = gatesFor(airport).find(f => f.id === id)!;
    assert.equal(stand.name, name);
    const position = standPlacement(id, false, airport)!.position;
    const marker = {x: (lon - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (lat - airport.origin.lat) * 60};
    assert.ok(Math.hypot(position.x - marker.x, position.y - marker.y) * 1852 < 2, name);
    const [join, start] = airport.features.find(f => f.id === `inferred-calgary-${name.toLowerCase()}-connector`)!.points, next = stand.points[1];
    assert.deepEqual(start, stand.points[0]);
    const dx = start.x - next.x, dy = start.y - next.y, ex = join.x - start.x, ey = join.y - start.y;
    assert.ok(Math.hypot(ex, ey) * 1852 < 43, name);
    assert.ok(Math.abs(dx * ey - dy * ex) < 1e-10 && dx * ex + dy * ey > 0, name);
    for (const other of airport.features.filter(f => f.kind === "parking_position" && f.id !== id))
      for (let i = 1; i < other.points.length; i++) assert.equal(crosses(join, start, other.points[i - 1], other.points[i]), false, `${name} crosses ${other.name}`);
    for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position, end.id).path, `${name} ${end.id}`);
  }
});
