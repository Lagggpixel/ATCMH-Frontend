import assert from "node:assert/strict";
import test from "node:test";
import {getAirport} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Sarajevo mapped apron lines match the parking chart and remain connected", () => {
  const airport = getAirport({airport: "LQSA"});
  const previous = getAirport({airport: "LQSA", airportDataVersion: "413af66976970cd8cfd612611b0fc1884ebb84299691287d2d6f4151f942d560"});
  const coordinates: [string, number, number][] = [["5", 29.47, 15.98], ["6", 30.65, 12.84], ["7", 31.54, 10.46], ["8", 32.30, 8.43], ["9", 33.08, 6.36]];
  const gates = gatesFor(airport);
  assert.equal(previous.features.filter(feature => feature.kind === "parking_position").length, 0);
  assert.equal(gates.length, coordinates.length + 6);
  for (const [name, latSeconds, lonSeconds] of coordinates) {
    const stand = gates.find(gate => gate.name === name)!;
    assert.ok(stand, name);
    const old = previous.features.find(feature => feature.id === stand.id)!;
    assert.equal(old.kind, "taxiway");
    assert.deepEqual(stand.points, old.points);
    const lat = 43 + 49 / 60 + latSeconds / 3600, lon = 18 + 20 / 60 + lonSeconds / 3600;
    const chart = {x: (lon - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (lat - airport.origin.lat) * 60};
    const position = standPlacement(stand.id, false, airport)!.position;
    assert.ok(Math.hypot(position.x - chart.x, position.y - chart.y) * 1852 < 12, name);
    assert.ok(planTaxiRoute(airport, position, "29").path, name);
    assert.ok(!planTaxiRoute(airport, position, "11").path, name);
  }
});
