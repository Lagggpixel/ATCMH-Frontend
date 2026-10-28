import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Düsseldorf A07 approaches its mapped stop from the apron side", () => {
  const airport = getAirport({airport: "EDDL", airportDataVersion: "89d5c6b3814f2810787f463eaefa4b310247dc8cdf301187d03a68cd27513cf6"});
  const previous = getAirport({airport: "EDDL", airportDataVersion: "076e383f271aa8f44a8b4bab668f6575df1d55350b6e09871da8794d231f4795"});
  assert.deepEqual(airport.features.slice(0, previous.features.length), previous.features);
  assert.equal(gatesFor(airport).length, gatesFor(previous).length + 1);
  const stand = gatesFor(airport).find(f => f.id === "1009877595-stand")!;
  assert.equal(stand.name, "A07");
  const branch = airport.features.find(f => f.id === "1009877595")!;
  assert.equal(branch.kind, "taxilane");
  assert.deepEqual(stand.points, branch.points.slice(0, 2));
  const point = standPlacement(stand.id, false, airport)!.position;
  const marker = {x: (6.7669063 - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (51.2825238 - airport.origin.lat) * 60};
  assert.ok(Math.hypot(point.x - marker.x, point.y - marker.y) * 1852 < 2);
  const [join, start] = airport.features.find(f => f.id === "inferred-dusseldorf-a07-connector")!.points, next = stand.points[1];
  assert.deepEqual(start, stand.points[0]);
  const dx = start.x - next.x, dy = start.y - next.y, ex = join.x - start.x, ey = join.y - start.y;
  assert.ok(Math.hypot(ex, ey) * 1852 < 39);
  assert.ok(Math.abs(dx * ey - dy * ex) < 1e-10 && dx * ex + dy * ey > 0);
  for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, point, end.id).path, end.id);
});
