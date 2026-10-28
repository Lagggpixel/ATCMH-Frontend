import assert from "node:assert/strict";
import test from "node:test";
import {getAirport} from "./airports";
import {gatesFor} from "./scenarios";
import {buildTaxiGraph} from "./taxi-routing";

test("Nice conflicting stand 35B lines are withheld until chart direction is mapped", () => {
  const airport = getAirport({airport: "LFMN", airportDataVersion: "a1da0f45584cbb88f4c9c9529a73bb0fdcaf8d0826ee96fada36b47b024a01af"});
  const previous = getAirport({airport: "LFMN", airportDataVersion: "fab9e2efa81d3b9bb39f2acdf57f57accccd63d06b36fdcc0efb985f2266ff8e"});
  // The chart depicts 35B on a diagonal rather than the two parallel mapped lines.
  assert.equal(gatesFor(previous).filter(gate => gate.name === "35B").length, 2);
  assert.equal(gatesFor(airport).filter(gate => gate.name === "35B").length, 0);
  for (const id of ["250172388", "962258880"]) {
    const old = previous.features.find(feature => feature.id === id)!;
    const current = airport.features.find(feature => feature.id === id)!;
    assert.equal(current.kind, "taxilane");
    assert.deepEqual(current.points, old.points);
  }
  assert.deepEqual(buildTaxiGraph(airport), buildTaxiGraph(previous));
});
