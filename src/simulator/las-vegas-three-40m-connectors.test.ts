import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import nodes from "./las-vegas-three-40m-gate-nodes.json";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Las Vegas estimated apron links connect three terminal stand lines", () => {
  const airport = getAirport({airport: "KLAS"});
  const previous = getAirport({airport: "KLAS", airportDataVersion: "8e3120fcafac1c6b6386d4f0edbb8ffee2f0985d6b5d1daf156643d399cbd234"});
  assert.deepEqual(airport.features.slice(0, previous.features.length), previous.features);
  assert.equal(airport.features.length, previous.features.length + nodes.length);
  for (const [name, id, lat, lon] of nodes as [string, string, number, number, string][]) {
    const stand = airport.features.find(feature => feature.id === id)!;
    const connector = airport.features.find(feature => feature.id === `inferred-las-${name.toLowerCase()}-connector`)!;
    assert.ok(!gatesFor(previous).some(gate => gate.id === id), name);
    assert.ok(gatesFor(airport).some(gate => gate.id === id), name);
    const position = standPlacement(id, false, airport)!.position;
    assert.deepEqual(position, standPlacement(id, false, previous)!.position);
    const terminal = {x: (lon - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (lat - airport.origin.lat) * 60};
    assert.ok(Math.hypot(position.x - terminal.x, position.y - terminal.y) * 1852 < 45, name);
    assert.equal(connector.kind, "taxilane");
    const [join, start] = connector.points, next = stand.points[1];
    assert.deepEqual(start, stand.points[0]);
    const dx = start.x - next.x, dy = start.y - next.y, ex = join.x - start.x, ey = join.y - start.y;
    assert.ok(Math.hypot(ex, ey) * 1852 < 42, name);
    assert.ok(Math.abs(dx * ey - dy * ex) < 1e-10 && dx * ex + dy * ey > 0, name);
    for (const other of airport.features.filter(feature => feature.kind === "parking_position" && feature.id !== id)) {
      for (let i = 1; i < other.points.length; i++) {
        const a = other.points[i - 1], b = other.points[i], vx = b.x - a.x, vy = b.y - a.y;
        const denominator = ex * vy - ey * vx;
        if (Math.abs(denominator) < 1e-12) continue;
        const wx = a.x - start.x, wy = a.y - start.y;
        const t = (wx * vy - wy * vx) / denominator, u = (wx * ey - wy * ex) / denominator;
        assert.ok(!(t > 1e-7 && t < 1 - 1e-7 && u >= 0 && u <= 1), `${name} crosses ${other.id}`);
      }
    }
    for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position, end.id).path, `${name} to ${end.id}`);
  }
});
