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
test("Calgary eight mapped stops connect via inferred apron links", () => {
  const airport = getAirport({airport: "CYYC", airportDataVersion: "63f4965f5e92fff1f359529eec97982116487639e091536d7e48e313672f4415"});
  const previous = getAirport({airport: "CYYC", airportDataVersion: "b43d527fc367e1e5fa450bbed7c643d6f1f4dac3f151ec973161d6452daebf1c"});
  assert.deepEqual(airport.features.slice(0, previous.features.length), previous.features);
  assert.equal(gatesFor(airport).length, gatesFor(previous).length + 8);
  for (const [name, id, lat, lon] of [["12", "1038377212", 51.1331744, -114.0134035], ["18", "1038377222", 51.1332803, -114.0153743], ["34", "1038378837", 51.1297169, -114.0127194], ["36", "1038378839", 51.1294382, -114.0130981], ["35A", "1038378847", 51.1294373, -114.0117389], ["50", "1038378860", 51.1294785, -114.0090986], ["54", "1038378863", 51.1286967, -114.0091783], ["59", "1151630798", 51.1282567, -114.008243]] as const) {
    const stand = gatesFor(airport).find(f => f.id === id)!;
    assert.equal(stand.name, name);
    const position = standPlacement(id, false, airport)!.position;
    const marker = {x: (lon - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (lat - airport.origin.lat) * 60};
    assert.ok(Math.hypot(position.x - marker.x, position.y - marker.y) * 1852 < 2, name);
    const [join, start] = airport.features.find(f => f.id === `inferred-calgary-${name.toLowerCase()}-connector`)!.points, next = stand.points[1];
    assert.deepEqual(start, stand.points[0]);
    const dx = start.x - next.x, dy = start.y - next.y, ex = join.x - start.x, ey = join.y - start.y;
    assert.ok(Math.hypot(ex, ey) * 1852 < 32, name);
    assert.ok(Math.abs(dx * ey - dy * ex) < 1e-10 && dx * ex + dy * ey > 0, name);
    for (const other of airport.features.filter(f => f.kind === "parking_position" && f.id !== id))
      for (let i = 1; i < other.points.length; i++) assert.equal(crosses(join, start, other.points[i - 1], other.points[i]), false, `${name} crosses ${other.name}`);
    for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position, end.id).path, `${name} ${end.id}`);
  }
});
