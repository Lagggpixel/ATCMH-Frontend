import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Stuttgart mapped stands match the charted area and reach both runway ends", () => {
  const airport = getAirport({airport: "EDDS", airportDataVersion: "51aa2638c7c4e6ed83e0189c86b845ba77052be50db4f3d596f26515ccb749c5"});
  const previous = getAirport({airport: "EDDS", airportDataVersion: "8c7f73aa0da2e391e13ecc06911a7cbdc00ee6893a9ebc31fd4a9dc5a1ad5a07"});
  // The chart rounds coordinates to a tenth of a minute.
  const references: Record<string, [number, number]> = {"36": [41.5, 12.5], "64": [41.5, 12.5], "73": [41.4, 12.5], "74": [41.5, 12.5], "75": [41.5, 12.5]};
  const gates = gatesFor(airport);
  assert.equal(gatesFor(previous).length, 0);
  assert.deepEqual(new Set(gates.map(gate => gate.name)), new Set(Object.keys(references)));
  for (const gate of gates) {
    const [latMinutes, lonMinutes] = references[gate.name];
    const point = {x: (9 + lonMinutes / 60 - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (48 + latMinutes / 60 - airport.origin.lat) * 60};
    const position = standPlacement(gate.id, false, airport)!.position;
    assert.ok(Math.hypot(position.x - point.x, position.y - point.y) * 1852 < 125, gate.name);
    for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position, end.id).path, `${gate.name} to ${end.id}`);
  }
});
