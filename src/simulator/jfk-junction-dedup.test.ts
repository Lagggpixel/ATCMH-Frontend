import assert from "node:assert/strict";
import test from "node:test";
import {getAirport} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {buildTaxiGraph, planTaxiRoute} from "./taxi-routing";

test("JFK parking junctions are not offered as separate stands", () => {
  const airport = getAirport({airport: "KJFK"});
  const previous = getAirport({airport: "KJFK", airportDataVersion: "c5172dcf1e0d22e2b8502ea33234e46f235a471169793af8d600eda02524d57b"});
  const pairs = [["632238193", "632238192"], ["1010401533", "1010401534"], ["1010401555", "1010401556"], ["1010401557", "1010401558"], ["1011115456", "1011115457"], ["1011144693", "1011144694"], ["1011144695", "1011144696"]] as const;
  const oldGates = gatesFor(previous), gates = gatesFor(airport);
  for (const [branchId, standId] of pairs) {
    const branch = previous.features.find(feature => feature.id === branchId)!;
    const oldStand = previous.features.find(feature => feature.id === standId)!;
    const after = airport.features.find(feature => feature.id === branchId)!;
    assert.ok(oldGates.some(gate => gate.id === branchId));
    assert.ok(gates.some(gate => gate.id === standId));
    assert.ok(!gates.some(gate => gate.id === branchId));
    assert.equal(branch.name, oldStand.name);
    assert.ok(oldStand.points.slice(0, -1).some(point => point.x === branch.points.at(-1)!.x && point.y === branch.points.at(-1)!.y));
    assert.equal(after.kind, "taxilane");
    assert.deepEqual(after.points, branch.points);
    assert.ok(planTaxiRoute(airport, standPlacement(standId, false, airport)!.position, "13L").path, standId);
  }
  assert.deepEqual(buildTaxiGraph(airport), buildTaxiGraph(previous));
});
