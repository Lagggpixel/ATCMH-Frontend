import assert from "node:assert/strict";
import test from "node:test";
import {getAirport} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Bergamo stand 409 matches its published coordinate and the main runway network", () => {
  const airport = getAirport({airport: "LIME"});
  const previous = getAirport({airport: "LIME", airportDataVersion: "bbd81ec9910d37966b96142715c4501b7ba4bf1020f4e86d12d3a1ae376092c9"});
  const gates = gatesFor(airport);
  assert.equal(gatesFor(previous).length, 0);
  assert.deepEqual(gates.map(gate => gate.name), ["409"]);
  const point = {x: (9 + 42 / 60 + 36.25 / 3600 - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (45 + 39 / 60 + 52.84 / 3600 - airport.origin.lat) * 60};
  const position = standPlacement(gates[0].id, false, airport)!.position;
  assert.ok(Math.hypot(position.x - point.x, position.y - point.y) * 1852 < 3);
  for (const end of ["10", "28"]) assert.ok(planTaxiRoute(airport, position, end).path, end);
  for (const end of ["12", "30"]) assert.ok(!planTaxiRoute(airport, position, end).path, end);
});
