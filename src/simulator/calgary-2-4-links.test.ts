import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Calgary stands 2 through 4 use mapped parking nodes and inferred connections", () => {
  const airport = getAirport({airport: "CYYC"});
  const previous = getAirport({airport: "CYYC", airportDataVersion: "459488c95b7620fe10b5b3630135af7f83568ec515541b2dc921089b44675c28"});
  assert.deepEqual(airport.features.slice(0, previous.features.length), previous.features);
  for (const [name, id, lat, lon] of [["2", "1038377195", 51.1342628, -114.0126822], ["3", "1038377196", 51.1345757, -114.0126834], ["4", "1038377197", 51.1348851, -114.0126764]] as const) {
    assert.ok(!gatesFor(previous).some(gate => gate.id === id));
    const stand = gatesFor(airport).find(gate => gate.id === id)!;
    assert.equal(stand.name, name);
    const position = standPlacement(id, false, airport)!.position;
    const marker = {x: (lon - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (lat - airport.origin.lat) * 60};
    assert.ok(Math.hypot(position.x - marker.x, position.y - marker.y) * 1852 < 2, name);
    const [join, start] = airport.features.find(f => f.id === `inferred-calgary-${name}-connector`)!.points, next = stand.points[1];
    assert.deepEqual(start, stand.points[0]);
    const dx = start.x - next.x, dy = start.y - next.y, ex = join.x - start.x, ey = join.y - start.y;
    assert.ok(Math.hypot(ex, ey) * 1852 < 12);
    assert.ok(Math.abs(dx * ey - dy * ex) < 1e-10 && dx * ex + dy * ey > 0);
    for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position, end.id).path, `${name} ${end.id}`);
  }
});
