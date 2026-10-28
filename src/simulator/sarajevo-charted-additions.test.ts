import assert from "node:assert/strict";
import test from "node:test";
import {getAirport} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Sarajevo charted stand references connect to the mapped apron", () => {
  const airport = getAirport({airport: "LQSA"});
  const previous = getAirport({airport: "LQSA", airportDataVersion: "714d7e21dfe59c1e58a0ce2a0d67e1d269f52ef47fb7d6edb927c8d743fe219d"});
  const coordinates: [string, number, number][] = [["1",26.85,22.97],["2",27.50,21.22],["3",28.16,19.48],["4",28.82,17.73],["10",33.72,4.63],["11",34.37,2.90]];
  assert.deepEqual(gatesFor(previous).map(gate => gate.name), ["5", "6", "7", "8", "9"]);
  for (const [name, latSeconds, lonSeconds] of coordinates) {
    const stand = gatesFor(airport).find(gate => gate.name === name);
    assert.ok(stand, name);
    const lat = 43 + 49 / 60 + latSeconds / 3600, lon = 18 + 20 / 60 + lonSeconds / 3600;
    const chart = {x: (lon - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (lat - airport.origin.lat) * 60};
    const position = standPlacement(stand.id, false, airport)!.position;
    assert.ok(Math.hypot(position.x - chart.x, position.y - chart.y) * 1852 < 0.1, name);
    assert.ok(planTaxiRoute(airport, position, "29").path, name);
    assert.ok(!planTaxiRoute(airport, position, "11").path, name);
  }
});
