import assert from "node:assert/strict";
import test from "node:test";
import {getAirport} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {buildTaxiGraph} from "./taxi-routing";

test("Nice conflicting stand 37B lines are withheld until chart direction is mapped", () => {
  const airport = getAirport({airport: "LFMN", airportDataVersion: "fab9e2efa81d3b9bb39f2acdf57f57accccd63d06b36fdcc0efb985f2266ff8e"});
  const previous = getAirport({airport: "LFMN", airportDataVersion: "a20a41b6dd665f39d084b4c386a1a2cc4fae5b5dc652520800d22beb8aa29ed0"});
  assert.equal(gatesFor(previous).filter(gate => gate.name === "37B").length, 2);
  assert.equal(gatesFor(airport).filter(gate => gate.name === "37B").length, 0);
  assert.deepEqual(standPlacement("962258876", false, airport)!.position, standPlacement("962258876", false, previous)!.position);
  for (const id of ["250172386", "962258877"]) {
    const old = previous.features.find(feature => feature.id === id)!;
    const current = airport.features.find(feature => feature.id === id)!;
    assert.equal(current.kind, "taxilane");
    assert.deepEqual(current.points, old.points);
  }
  assert.deepEqual(buildTaxiGraph(airport), buildTaxiGraph(previous));
});
