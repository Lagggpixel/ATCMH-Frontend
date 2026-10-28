import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {buildTaxiGraph, planTaxiRoute} from "./taxi-routing";

test("Brasília stands 17 and 18 exclude approach junctions", () => {
  const airport = getAirport({airport: "SBBR", airportDataVersion: "fc5d48b4411ce7420be2fc44162a4882da29b9d3272fb751c3044f897ae42f6c"});
  const previous = getAirport({airport: "SBBR", airportDataVersion: "1433d9515cb6d7a849a5c3084e180d3c9e776071ea0a839b0696d222162f92d1"});
  const stands = [["17", "282574485", -15.8683136, -47.9200838], ["18", "470012318", -15.8687183, -47.9203204]] as const;
  for (const [name, id, lat, lon] of stands) {
    assert.equal(gatesFor(previous).filter(gate => gate.name === name).length, 2);
    const matches = gatesFor(airport).filter(gate => gate.name === name);
    assert.equal(matches.length, 1, name);
    assert.equal(matches[0].id, id);
    const position = standPlacement(id, false, airport)!.position;
    const node = {x: (lon - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (lat - airport.origin.lat) * 60};
    assert.ok(Math.hypot(position.x - node.x, position.y - node.y) * 1852 < 1, name);
    for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position, end.id).path, `${name} to ${end.id}`);
  }
  for (const id of ["1432096001", "1432096002"]) {
    const before = previous.features.find(feature => feature.id === id)!;
    const after = airport.features.find(feature => feature.id === id)!;
    assert.equal(after.kind, "taxilane");
    assert.deepEqual(after.points, before.points);
  }
  assert.deepEqual(buildTaxiGraph(airport), buildTaxiGraph(previous));
});
