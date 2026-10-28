import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Auckland international stands 9 and 10 face the terminal rather than apron junctions", () => {
  const airport = getAirport({airport: "NZAA"});
  const prior = getAirport({airport: "NZAA", airportDataVersion: "e8080b961ee30c2cb9b8f5b0df69d3d49ffa3522a975edd5ddb1311f5c8dd4a0"});
  const gates = gatesFor(airport);
  for (const [name, id, lat, lon] of [["9", "1097803689", -37.0079001, 174.7818439], ["10", "1097801873", -37.0081785, 174.7820300]] as const) {
    const matches = gates.filter(gate => gate.name === name);
    assert.equal(matches.length, 1, name);
    assert.equal(matches[0].id, id);
    const position = standPlacement(id, false, airport)!.position;
    const osmGate = {x: (lon - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (lat - airport.origin.lat) * 60};
    assert.ok(Math.hypot(position.x - osmGate.x, position.y - osmGate.y) * 1852 < 35, name);
    assert.deepEqual(matches[0].points, prior.features.find(feature => feature.id === id)!.points.toReversed());
    for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position, end.id).path, `${name} to ${end.id}`);
  }
  for (const id of ["1097802035", "1097802036", "1097801874", "1097803690"]) {
    const before = prior.features.find(feature => feature.id === id)!;
    const after = airport.features.find(feature => feature.id === id)!;
    assert.equal(before.kind, "parking_position");
    assert.equal(after.kind, "taxilane");
    assert.deepEqual(after.points, before.points);
    assert.ok(!gates.some(gate => gate.id === id));
  }
});
