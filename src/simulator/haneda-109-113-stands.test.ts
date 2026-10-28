import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Haneda terminal 3 stands use mapped endpoints facing named terminal gates", () => {
  const airport = getAirport({airport: "RJTT"});
  const previous = getAirport({airport: "RJTT", airportDataVersion: "a2a8d071e131d3ecb0271fa32ccef493bfe0950bf19af7a263b806e7898d07d7"});
  assert.deepEqual(airport.features.slice(0, previous.features.length), previous.features);
  for (const [name, id, lat, lon] of [["109", "500718217", 35.5443254, 139.7707585], ["110", "500718216", 35.5448911, 139.7703357], ["111", "500718215", 35.5454348, 139.7699593], ["112", "500718213", 35.5460911, 139.7694448], ["113", "500718214", 35.5466605, 139.7690553], ["114", "500718212", 35.5472264, 139.7686714]] as const) {
    assert.ok(!gatesFor(previous).some(gate => gate.id === id));
    const stand = gatesFor(airport).find(gate => gate.id === id)!;
    assert.equal(stand.name, name);
    const position = standPlacement(id, false, airport)!.position;
    const marker = {x: (lon - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (lat - airport.origin.lat) * 60};
    assert.ok(Math.hypot(position.x - marker.x, position.y - marker.y) * 1852 < 35, name);
    assert.ok(Math.hypot(stand.points[0].x - marker.x, stand.points[0].y - marker.y) * 1852 > 140, name);
    for (const end of runwayEnds(airport)) {
      const route = planTaxiRoute(airport, position, end.id);
      if (end.id === "34L") assert.ok(!route.path, name);
      else assert.ok(route.path, `${name} ${end.id}`);
    }
  }
});
