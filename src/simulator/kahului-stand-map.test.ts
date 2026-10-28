import assert from "node:assert/strict";
import test from "node:test";
import {getAirport} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Kahului mapped parking endpoints remain connected and retain the earlier snapshot", () => {
  const airport = getAirport({airport: "PHOG"});
  const previous = getAirport({airport: "PHOG", airportDataVersion: "518b2da996693bd25aa2e14023508fbbc1b3faa7dbaadf00415e15b9e07fa132"});
  const names = ["39", "35", "33", "29", "27", "23B", "23A", "21B", "21A", "19", "17", "15", "13", "11", "9", "7", "5", "1"];
  const gates = gatesFor(airport);
  assert.equal(gatesFor(previous).length, 0);
  assert.deepEqual(new Set(gates.map(gate => gate.name)), new Set(names));
  for (const gate of gates) {
    const old = previous.features.find(feature => feature.id === gate.id)!;
    assert.equal(old.kind, "taxilane");
    assert.deepEqual(gate.points, old.points);
    const position = standPlacement(gate.id, false, airport)!.position;
    for (const runway of ["02", "20", "05"] as const) assert.ok(planTaxiRoute(airport, position, runway).path, `${gate.name} to ${runway}`);
    assert.ok(!planTaxiRoute(airport, position, "23").path, gate.name);
  }
});
