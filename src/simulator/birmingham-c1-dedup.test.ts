import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {buildTaxiGraph, planTaxiRoute} from "./taxi-routing";

test("Birmingham gate C1 excludes the approach junction and keeps stand orientations", () => {
  const airport = getAirport({airport: "KBHM"});
  const previous = getAirport({airport: "KBHM", airportDataVersion: "940275b5746ce599708379d966d420bc752ffcefc2c22afd10ebe0804ef9b044"});
  assert.equal(gatesFor(previous).filter(gate => gate.name === "C1").length, 2);
  const matches = gatesFor(airport).filter(gate => gate.name === "C1");
  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, "1057185569");
  const position = standPlacement(matches[0].id, false, airport)!.position;
  const mappedGate = {x: (-86.7533870 - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (33.5613680 - airport.origin.lat) * 60};
  assert.ok(Math.hypot(position.x - mappedGate.x, position.y - mappedGate.y) * 1852 < 35);
  for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position, end.id).path, end.id);
  for (const stand of previous.features.filter(feature => feature.kind === "parking_position" && feature.id.startsWith("10571855"))) {
    assert.deepEqual(standPlacement(stand.id, false, airport), standPlacement(stand.id, false, previous), stand.id);
  }
  const before = previous.features.find(feature => feature.id === "1192263260")!;
  const after = airport.features.find(feature => feature.id === "1192263260")!;
  assert.equal(after.kind, "taxilane");
  assert.deepEqual(after.points, before.points);
  assert.deepEqual(buildTaxiGraph(airport), buildTaxiGraph(previous));
});
