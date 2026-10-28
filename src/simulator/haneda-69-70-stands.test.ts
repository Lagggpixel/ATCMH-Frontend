import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Haneda stands 69 and 70 connect directly and face their terminal gate markers", () => {
  const airport = getAirport({airport: "RJTT"});
  const previous = getAirport({airport: "RJTT", airportDataVersion: "a2a8d071e131d3ecb0271fa32ccef493bfe0950bf19af7a263b806e7898d07d7"});
  for (const [name, id, lat, lon] of [["69", "500718440", 35.5488374, 139.7933234], ["70", "500718221", 35.5485504, 139.7927467]] as const) {
    assert.ok(!gatesFor(previous).some(gate => gate.id === id));
    const stand = gatesFor(airport).find(gate => gate.id === id)!;
    assert.equal(stand.name, name);
    const position = standPlacement(id, false, airport)!.position;
    const marker = {x: (lon - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (lat - airport.origin.lat) * 60};
    assert.ok(Math.hypot(position.x - marker.x, position.y - marker.y) * 1852 < 50, name);
    assert.ok(Math.hypot(stand.points[0].x - marker.x, stand.points[0].y - marker.y) * 1852 > 200, name);
    for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position, end.id).path, `${name} ${end.id}`);
  }
});
