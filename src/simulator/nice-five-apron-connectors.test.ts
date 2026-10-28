import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Nice inferred apron connectors make five mapped stands reachable", () => {
  const airport = getAirport({airport: "LFMN"});
  const previous = getAirport({airport: "LFMN", airportDataVersion: "2c606c5f99b199f0f79a5a0ea81be388c12414945a58ddca73a0d72a173c80cd"});
  for (const name of ["5", "7", "11", "75A", "75D"]) {
    const stand = airport.features.find(feature => feature.kind === "parking_position" && feature.name === name)!;
    const connector = airport.features.find(feature => feature.id === `inferred-nice-${name.toLowerCase()}-connector`)!;
    assert.ok(!gatesFor(previous).some(gate => gate.id === stand.id), name);
    assert.ok(gatesFor(airport).some(gate => gate.id === stand.id), name);
    assert.deepEqual(standPlacement(stand.id, false, airport), standPlacement(stand.id, false, previous));
    assert.equal(connector.kind, "taxilane");
    const [join, start] = connector.points, next = stand.points[1];
    assert.deepEqual(start, stand.points[0]);
    const dx = start.x - next.x, dy = start.y - next.y, ex = join.x - start.x, ey = join.y - start.y;
    assert.ok(Math.hypot(ex, ey) * 1852 < 20, name);
    assert.ok(Math.abs(dx * ey - dy * ex) < 1e-10 && dx * ex + dy * ey > 0, name);
    for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, standPlacement(stand.id, false, airport)!.position, end.id).path, `${name} to ${end.id}`);
  }
});
