import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import coordinates from "./nice-eleven-stand-coordinates.json";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Nice eleven stand positions follow the published INS checkpoints", () => {
  const airport = getAirport({airport: "LFMN"});
  const previous = getAirport({airport: "LFMN", airportDataVersion: "a1da0f45584cbb88f4c9c9529a73bb0fdcaf8d0826ee96fada36b47b024a01af"});
  for (const [name, id, lat, lon] of coordinates as [string, string, number, number][]) {
    const gate = gatesFor(airport).find(candidate => candidate.id === id)!;
    assert.equal(gate.name, name);
    const position = standPlacement(id, false, airport)!.position;
    const oldPosition = standPlacement(id, false, previous)!.position;
    const chart = {x: (lon - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (lat - airport.origin.lat) * 60};
    assert.ok(Math.hypot(position.x - chart.x, position.y - chart.y) * 1852 < 1, name);
    assert.ok(Math.hypot(oldPosition.x - chart.x, oldPosition.y - chart.y) * 1852 > 8, name);
    const tail = airport.features.find(feature => feature.id === `${id}-checkpoint-tail`)!;
    assert.equal(tail.kind, "taxilane");
    assert.deepEqual(tail.points[0], position);
    assert.deepEqual(tail.points.at(-1), previous.features.find(feature => feature.id === id)!.points.at(-1));
    for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position, end.id).path, `${name} to ${end.id}`);
  }
});
