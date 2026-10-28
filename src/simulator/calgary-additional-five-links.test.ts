import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import type {Point} from "./model";
import nodes from "./calgary-additional-five-nodes.json";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

function crosses(a: Point, b: Point, c: Point, d: Point) {
  const x = b.x - a.x, y = b.y - a.y, u = d.x - c.x, v = d.y - c.y, det = x * v - y * u;
  if (Math.abs(det) < 1e-12) return false;
  const dx = c.x - a.x, dy = c.y - a.y, t = (dx * v - dy * u) / det, s = (dx * y - dy * x) / det;
  return t > 0 && t < 1 && s > 0 && s < 1;
}
test("Calgary five additional mapped stops use inferred links without crossing mapped stands", () => {
  const airport = getAirport({airport: "CYYC"});
  const previous = getAirport({airport: "CYYC", airportDataVersion: "eacfe49356ff80d2c4e5d01c503379857f8019c30ace6cc7ee2baf3ab054c8c8"});
  assert.deepEqual(airport.features.slice(0, previous.features.length), previous.features);
  assert.equal(nodes.length, 5);
  assert.equal(gatesFor(airport).length, gatesFor(previous).length + nodes.length);
  for (const node of nodes) {
    const stand = gatesFor(airport).find(f => f.id === node.id)!;
    assert.equal(stand.name, node.name);
    const position = standPlacement(node.id, false, airport)!.position;
    const marker = {x: (node.lon - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (node.lat - airport.origin.lat) * 60};
    assert.ok(Math.hypot(position.x - marker.x, position.y - marker.y) * 1852 < 2, node.name);
    const connector = airport.features.find(f => f.id === `inferred-calgary-${node.name.toLowerCase()}-connector`)!;
    const [join, start] = connector.points, next = stand.points[1];
    assert.deepEqual(start, stand.points[0]);
    const dx = start.x - next.x, dy = start.y - next.y, ex = join.x - start.x, ey = join.y - start.y;
    assert.ok(Math.hypot(ex, ey) * 1852 < 35, node.name);
    assert.ok(Math.abs(dx * ey - dy * ex) < 1e-10 && dx * ex + dy * ey > 0, node.name);
    for (const other of airport.features.filter(f => f.kind === "parking_position" && f.id !== node.id))
      for (let i = 1; i < other.points.length; i++) assert.equal(crosses(join, start, other.points[i - 1], other.points[i]), false, `${node.name} crosses ${other.name}`);
    for (const other of airport.features.filter(f => f.id.startsWith("inferred-calgary-") && f.id !== connector.id))
      for (let i = 1; i < other.points.length; i++) assert.equal(crosses(join, start, other.points[i - 1], other.points[i]), false, `${node.name} crosses ${other.id}`);
    for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position, end.id).path, `${node.name} ${end.id}`);
  }
});
