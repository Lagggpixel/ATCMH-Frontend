import assert from "node:assert/strict";
import test from "node:test";
import {getAirport} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Aspen terminal parking lines retain mapped endpoints without inventing taxi connections", () => {
  const airport = getAirport({airport: "KASE"});
  const previous = getAirport({airport: "KASE", airportDataVersion: "f2878c1d26ca49b1779beb0b33092475491808484294da18db08b71156006904"});
  assert.deepEqual(airport.features.slice(0, previous.features.length), previous.features);
  const stands = airport.features.slice(previous.features.length);
  assert.equal(stands.length, 10);
  assert.deepEqual(gatesFor(airport), []);
  assert.deepEqual(gatesFor(previous), []);
  const position = standPlacement("1188003940", false, airport)!.position;
  const mappedNode = {x: (-106.8648455 - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (39.2186032 - airport.origin.lat) * 60};
  assert.ok(Math.hypot(position.x - mappedNode.x, position.y - mappedNode.y) * 1852 < 1);
  for (const stand of stands) {
    assert.equal(stand.kind, "parking_position");
    assert.equal(stand.name, "");
    const p = standPlacement(stand.id, false, airport)!.position;
    assert.ok(planTaxiRoute(airport, p, "15").error);
  }
});
