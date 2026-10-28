import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("San Diego mapped stands match the charted area and reach both runway ends", () => {
  const airport = getAirport({airport: "KSAN"});
  const previous = getAirport({airport: "KSAN", airportDataVersion: "cf96bdd24f42649c3984e504ea98f25e90694dbc31c950ff3834cac47543d96d"});
  // The chart rounds coordinates to a tenth of a minute.
  const references: Record<string, [number, number]> = {"21": [43.9, 12], "22": [43.9, 12], "23": [43.9, 12.1], "28": [44, 12], "33": [43.9, 12.1], "34": [43.9, 12.2], "35": [43.9, 12.2], "36": [44, 12.2], "37": [44, 12.2], "38": [44, 12.2], "39": [44, 12.2], "51": [43.9, 12.4]};
  const gates = gatesFor(airport);
  assert.equal(gatesFor(previous).length, 0);
  const prior = getAirport({airport: "KSAN", airportDataVersion: "8478c77080b5f6babcf714bd80dd324930971f8aa2a1848b53af93da0d1de319"});
  assert.equal(gatesFor(prior).length, 9);
  assert.deepEqual(new Set(gates.map(gate => gate.name)), new Set(Object.keys(references)));
  for (const gate of gates) {
    const [latMinutes, lonMinutes] = references[gate.name];
    const point = {x: (-117 - lonMinutes / 60 - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (32 + latMinutes / 60 - airport.origin.lat) * 60};
    const position = standPlacement(gate.id, false, airport)!.position;
    assert.ok(Math.hypot(position.x - point.x, position.y - point.y) * 1852 < 125, gate.name);
    for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position, end.id).path, `${gate.name} to ${end.id}`);
  }
});
