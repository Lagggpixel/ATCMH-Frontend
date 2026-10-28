import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import nodes from "./las-vegas-terminal-gate-nodes.json";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Las Vegas terminal stand orientation points toward the mapped gate", () => {
  const airport = getAirport({airport: "KLAS"});
  const previous = getAirport({airport: "KLAS", airportDataVersion: "5a519df65628490ef68fa2d38015eb7d632e4c66ad1513129b1f6f8f0cd38b12"});
  // Gate nodes are terminal locations, not surveyed aircraft stopping points.
  // D gates: https://fsweb.harryreidairport.com/fswebfile/17593f56-3911-4c2b-9909-2c764a9675ed/1401910/Drinking%20Water%20Quality%20Control%20Plan.pdf
  for (const [name, id, lat, lon] of nodes as [string, string, number, number, string][]) {
    const stand = airport.features.find(feature => feature.id === id)!;
    const old = previous.features.find(feature => feature.id === id)!;
    assert.equal(stand.name, name);
    assert.deepEqual(stand.points, old.points.toReversed(), name);
    const point = {x: (lon - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (lat - airport.origin.lat) * 60};
    const position = standPlacement(id, false, airport)!.position;
    const oldPosition = standPlacement(id, false, previous)!.position;
    assert.ok(Math.hypot(position.x - point.x, position.y - point.y) * 1852 < 45, name);
    assert.ok(Math.hypot(oldPosition.x - point.x, oldPosition.y - point.y) * 1852 > 100, name);
    if (gatesFor(airport).some(gate => gate.id === id)) {
      for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position, end.id).path, `${name} to ${end.id}`);
    }
  }
  for (const id of ["183291205", "183291214", "183291254"]) {
    const old = previous.features.find(feature => feature.id === id)!;
    const current = airport.features.find(feature => feature.id === id)!;
    assert.equal(old.kind, "parking_position");
    assert.equal(current.kind, "taxilane");
    assert.deepEqual(current.points, old.points);
    assert.ok(!gatesFor(airport).some(gate => gate.id === id));
  }
});
