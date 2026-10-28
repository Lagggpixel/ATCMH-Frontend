import assert from "node:assert/strict";
import test from "node:test";
import {getAirport} from "./airports";
import {gatesFor} from "./scenarios";
import {buildTaxiGraph} from "./taxi-routing";

test("Nice diagonal 33B and 39B stands are withheld until their charted lead-ins are mapped", () => {
  const airport = getAirport({airport: "LFMN"});
  const previous = getAirport({airport: "LFMN", airportDataVersion: "83f3c23b2bcd91afbf701f9bc0d3e1093bba223d31f8d0181291024ee6dc5afb"});
  for (const [name, id] of [["33B", "962258883"], ["39B", "250172384"]] as const) {
    const old = previous.features.find(feature => feature.id === id)!;
    const current = airport.features.find(feature => feature.id === id)!;
    assert.ok(gatesFor(previous).some(gate => gate.id === id), name);
    assert.ok(!gatesFor(airport).some(gate => gate.name === name), name);
    assert.equal(current.kind, "taxilane");
    assert.deepEqual(current.points, old.points);
  }
  assert.deepEqual(buildTaxiGraph(airport), buildTaxiGraph(previous));
});
