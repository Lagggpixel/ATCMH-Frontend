import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Dallas mapped stands join the taxi network through short inferred extensions", () => {
  const airport = getAirport({airport: "KDAL"});
  const previous = getAirport({airport: "KDAL", airportDataVersion: "793e3052dcae882d3e12af870d726244cd7f0864afb1b9e08e052d82f3b195fc"});
  assert.deepEqual(airport.features.slice(0, previous.features.length), previous.features);
  for (const [name, id] of [["6", "1215434668"], ["4", "1215434669"], ["2", "1215434670"], ["1", "1215434671"]]) {
    assert.ok(!gatesFor(previous).some(gate => gate.id === id));
    assert.ok(gatesFor(airport).some(gate => gate.id === id));
    const stand = airport.features.find(f => f.id === id)!;
    const connector = airport.features.find(f => f.id === `inferred-dallas-${name}-connector`)!;
    assert.deepEqual(connector.points[1], stand.points[0]);
    const [join, start] = connector.points, next = stand.points[1];
    const dx = start.x - next.x, dy = start.y - next.y, ex = join.x - start.x, ey = join.y - start.y;
    assert.ok(Math.hypot(ex, ey) * 1852 < 8);
    assert.ok(Math.abs(dx * ey - dy * ex) < 1e-10 && dx * ex + dy * ey > 0);
    const point = standPlacement(id, false, airport)!.position;
    assert.deepEqual(point, standPlacement(id, false, previous)!.position);
    for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, point, end.id).path, `${name} ${end.id}`);
  }
});
