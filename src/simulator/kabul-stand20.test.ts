import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Kabul stand 20 uses the charted apron branch and retains its junction", () => {
  const airport = getAirport({airport: "OAKB"});
  const previous = getAirport({airport: "OAKB", airportDataVersion: "b95009e57b36877771e91b475f1c58ea1acde935a8da29a8639f6e4263adc79b"});
  const gate = gatesFor(airport).find(candidate => candidate.name === "20")!;
  assert.equal(gate.id, "945093839-stand-20");
  assert.ok(!gatesFor(previous).some(candidate => candidate.name === "20"));
  const old = previous.features.find(feature => feature.id === "945093839")!;
  const line = airport.features.find(feature => feature.id === old.id)!;
  assert.deepEqual([...line.points, ...gate.points.slice(1)], old.points);
  const placement = standPlacement(gate.id, false, airport)!;
  assert.deepEqual(placement.position, old.points.at(-1));
  assert.ok(placement.heading > 180 && placement.heading < 225);
  for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, placement.position, end.id).path, end.id);
});
