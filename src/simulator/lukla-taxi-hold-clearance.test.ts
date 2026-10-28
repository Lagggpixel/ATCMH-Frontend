import assert from "node:assert/strict";
import test from "node:test";
import {getAirport} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {buildTaxiGraph, planTaxiRoute} from "./taxi-routing";

test("Lukla routes its outer mapped stands to a training-only 150-foot runway boundary", () => {
  const airport = getAirport({airport: "VNLK"});
  const previous = getAirport({airport: "VNLK", airportDataVersion: "0545af36b556b7a4d07100275d7948c0a4fb75ec979f8f41eb10a66e6d7e2cca"});
  assert.equal(buildTaxiGraph(previous).holds.length, 0);
  assert.equal(gatesFor(previous).length, 0);
  const graph = buildTaxiGraph(airport), pair = airport.runways![0];
  assert.equal(pair.exitClearanceFeet, 150);
  assert.equal(pair.taxiHoldClearanceFeet, 150);
  assert.ok(graph.holds.length > 0);
  const [first, last] = pair.ends, dx = last.point.x - first.point.x, dy = last.point.y - first.point.y, length = Math.hypot(dx, dy);
  const lateral = (p: {x: number; y: number}) => Math.abs((p.x - first.point.x) * -dy / length + (p.y - first.point.y) * dx / length) * 6076;
  for (const id of graph.holds) assert.ok(Math.abs(lateral(graph.points[id]) - 150) < .01);
  assert.deepEqual(gatesFor(airport).map(gate => gate.id).sort(), ["1257098608", "1257098609"]);
  for (const gate of gatesFor(airport)) {
    const position = standPlacement(gate.id, false, airport)!.position;
    assert.ok(lateral(position) > 150);
    const route = planTaxiRoute(airport, position, "24");
    assert.ok(route.path, gate.id);
    assert.ok(Math.abs(lateral(route.path.at(-1)!) - 150) < .01);
    assert.ok(planTaxiRoute(airport, position, "06").error);
  }
  for (const id of ["1257098606", "1257098607"]) {
    const before = previous.features.find(feature => feature.id === id)!;
    const after = airport.features.find(feature => feature.id === id)!;
    assert.equal(after.kind, "taxiway");
    assert.deepEqual(after.points, before.points);
    assert.ok(lateral(after.points.at(-1)!) < 150);
    assert.ok(planTaxiRoute(airport, after.points.at(-1)!, "24").error);
  }
});
