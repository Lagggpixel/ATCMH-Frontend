import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import nodes from "./las-vegas-extra-gate-nodes.json";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Las Vegas additional stand lines point toward their terminal gates", () => {
  const airport = getAirport({airport: "KLAS"});
  const previous = getAirport({airport: "KLAS", airportDataVersion: "cecf6f15bcf1f092b3c8aa7e5bbcd1e6f955cbcc768eed554b5aa8e2ac1a5613"});
  for (const [name, id, lat, lon] of nodes as [string, string, number, number, string][]) {
    const stand = airport.features.find(feature => feature.id === id)!;
    const old = previous.features.find(feature => feature.id === id)!;
    assert.equal(stand.name, name);
    assert.deepEqual(stand.points, old.points.toReversed(), name);
    const gate = {x: (lon - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (lat - airport.origin.lat) * 60};
    const position = standPlacement(id, false, airport)!.position;
    const oldPosition = standPlacement(id, false, previous)!.position;
    const after = Math.hypot(position.x - gate.x, position.y - gate.y) * 1852;
    const before = Math.hypot(oldPosition.x - gate.x, oldPosition.y - gate.y) * 1852;
    assert.ok(after < 45 && before > after + 20, name);
    if (gatesFor(airport).some(candidate => candidate.id === id)) {
      for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position, end.id).path, `${name} to ${end.id}`);
    }
  }
});
