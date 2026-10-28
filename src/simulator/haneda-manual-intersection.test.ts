import assert from "node:assert/strict";
import test from "node:test";
import {getAirport} from "./airports";
import {buildGroundRoute, destinationAt, groundRouteError} from "./ground-route";
import {standPlacement} from "./scenarios";
import {buildTaxiGraph, planTaxiRoute} from "./taxi-routing";

// A3/L3 is an intersection departure, with 2,420 m TORA in the referenced AIP.
// https://nagodede.github.io/aip/japan/documents/RJTT_full.pdf
test("Haneda manual routing can select the mapped L3 intersection for 34L", () => {
  const airport = getAirport({airport: "RJTT"});
  const start = standPlacement("500718218", false, airport)!.position;
  const graph = buildTaxiGraph(airport);
  const l3 = airport.features.find(feature => feature.id === "500419209")!;
  const hold = graph.runwayHolds!["16R/34L"].map(index => graph.points[index])
    .find(point => l3.points.slice(1).some((end, i) => {
      const from = l3.points[i], dx = end.x - from.x, dy = end.y - from.y;
      const t = ((point.x - from.x) * dx + (point.y - from.y) * dy) / (dx * dx + dy * dy);
      return t >= 0 && t <= 1 && Math.hypot(point.x - from.x - t * dx, point.y - from.y - t * dy) < 1e-6;
    }))!;
  assert.ok(hold);
  assert.equal(planTaxiRoute(airport, start, "34L").path, undefined);
  assert.deepEqual(destinationAt(airport, hold), {type: "runway", id: "34L"});
  const {route, error} = buildGroundRoute(airport, "taxi", [start, hold]);
  assert.equal(error, undefined);
  assert.ok(route);
  assert.equal(groundRouteError(airport, route, "taxi"), null);
  assert.deepEqual(route.destination, {type: "runway", id: "34L"});
  assert.equal(route.points.at(-1)!.runway, "34L");
  assert.equal(route.points.at(-1)!.name, "L3");
  assert.ok(Math.hypot(route.points.at(-1)!.x - hold.x, route.points.at(-1)!.y - hold.y) < 1e-7);
  for (let i = 1; i < route.points.length; i++) {
    const from = graph.points.findIndex(p => Math.hypot(p.x - route.points[i - 1].x, p.y - route.points[i - 1].y) < 1e-7);
    const to = graph.points.findIndex(p => Math.hypot(p.x - route.points[i].x, p.y - route.points[i].y) < 1e-7);
    if (from < 0 || to < 0) continue;
    const edge = graph.edges[from].find(candidate => candidate.to === to);
    if (edge) {
      assert.ok(!edge.protectedBy?.includes("16R/34L"));
      assert.ok((edge.protectedBy?.length ?? 0) < 2);
    }
  }
});
