import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Montreal 87A retains its mapped stop and gets an inferred apron connection", () => {
  const airport = getAirport({airport: "CYUL"});
  const previous = getAirport({airport: "CYUL", airportDataVersion: "c0859ede242ab51818cacf9d95a7c31efa8aa96a8585427e1399a2f4e9426c9a"});
  assert.deepEqual(airport.features.slice(0, previous.features.length), previous.features);
  const id = "1303794268", stand = gatesFor(airport).find(f => f.id === id)!;
  assert.equal(stand.name, "87A");
  assert.ok(!gatesFor(previous).some(f => f.id === id));
  const position = standPlacement(id, false, airport)!.position;
  assert.deepEqual(position, standPlacement(id, false, previous)!.position);
  const marker = {x: (-73.7557509 - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (45.4547064 - airport.origin.lat) * 60};
  assert.ok(Math.hypot(position.x - marker.x, position.y - marker.y) * 1852 < 2);
  const [join, start] = airport.features.find(f => f.id === "inferred-montreal-87a-connector")!.points, next = stand.points[1];
  assert.deepEqual(start, stand.points[0]);
  const dx = start.x - next.x, dy = start.y - next.y, ex = join.x - start.x, ey = join.y - start.y;
  assert.ok(Math.hypot(ex, ey) * 1852 < 18);
  assert.ok(Math.abs(dx * ey - dy * ex) < 1e-10 && dx * ex + dy * ey > 0);
  for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position, end.id).path, end.id);
});
