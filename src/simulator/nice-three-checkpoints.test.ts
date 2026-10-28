import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Nice stands 52A, 56B and 58A use their published checkpoints", () => {
  const airport = getAirport({airport: "LFMN"});
  const previous = getAirport({airport: "LFMN", airportDataVersion: "3b5494a1b4586aade5d89b5b698197a9f9adfe8d7aeb91b207c9e301670a5ed8"});
  const stands: readonly (readonly [string, string, number, number])[] = [["52A","249929139",43.65875277777778,7.206080555555555],["56B","962258810",43.657225,7.204061111111112],["58A","962258812",43.65679166666666,7.203469444444445]];
  for (const [name, id, lat, lon] of stands) {
    assert.ok(gatesFor(airport).some(gate => gate.id === id), name);
    const position = standPlacement(id, false, airport)!.position;
    const oldPosition = standPlacement(id, false, previous)!.position;
    const chart = {x: (lon - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (lat - airport.origin.lat) * 60};
    assert.ok(Math.hypot(position.x - chart.x, position.y - chart.y) * 1852 < 2, name);
    assert.ok(Math.hypot(oldPosition.x - chart.x, oldPosition.y - chart.y) * 1852 > 15, name);
    const tail = airport.features.find(feature => feature.id === `${id}-checkpoint-tail`)!;
    assert.equal(tail.kind, "taxilane");
    assert.deepEqual(tail.points[0], position);
    assert.deepEqual(tail.points.at(-1), previous.features.find(feature => feature.id === id)!.points.at(-1));
    for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position, end.id).path, `${name} to ${end.id}`);
  }
});
