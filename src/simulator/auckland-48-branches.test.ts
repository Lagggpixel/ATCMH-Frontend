import assert from "node:assert/strict";
import test from "node:test";
import {getAirport} from "./airports";
import {gatesFor} from "./scenarios";
import {buildTaxiGraph} from "./taxi-routing";

test("Auckland unverified 48A and 48E branches are not offered as stands", () => {
  const airport = getAirport({airport: "NZAA"});
  const previous = getAirport({airport: "NZAA", airportDataVersion: "26c689aef1be351a8629c802414d936fc20cd273b3a5cc4fd9bd31176ba9150e"});
  assert.equal(gatesFor(previous).filter(gate => gate.name === "48A").length, 2);
  assert.equal(gatesFor(previous).filter(gate => gate.name === "48E").length, 3);
  assert.ok(!gatesFor(airport).some(gate => gate.name === "48A" || gate.name === "48E"));
  for (const id of ["1099627380", "1099627386", "1099627385", "1099627387", "1099627389"]) {
    const old = previous.features.find(feature => feature.id === id)!;
    const current = airport.features.find(feature => feature.id === id)!;
    assert.equal(current.kind, "taxilane");
    assert.deepEqual(current.points, old.points);
  }
  assert.deepEqual(buildTaxiGraph(airport), buildTaxiGraph(previous));
});
