import assert from "node:assert/strict";
import test from "node:test";
import {getAirport} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {buildTaxiGraph, planTaxiRoute} from "./taxi-routing";

test("Lukla mapped parking endpoints preserve apron lines and remain unavailable without runway holds", () => {
  const airport = getAirport({airport: "VNLK", airportDataVersion: "0545af36b556b7a4d07100275d7948c0a4fb75ec979f8f41eb10a66e6d7e2cca"});
  const previous = getAirport({airport: "VNLK", airportDataVersion: "3acea7b4675bc4b8262f72a4f4e4a7854883c4d4950ff52226fe19151322bced"});
  const stands = [["1257098606", 27.6875763, 86.7314521], ["1257098607", 27.6876989, 86.7316654], ["1257098608", 27.6873790, 86.7315718], ["1257098609", 27.6874997, 86.7317852]] as const;
  for (const [id, lat, lon] of stands) {
    const before = previous.features.find(feature => feature.id === id)!;
    const after = airport.features.find(feature => feature.id === id)!;
    assert.equal(before.kind, "taxiway");
    assert.equal(after.kind, "parking_position");
    assert.deepEqual(after.points, before.points);
    const position = standPlacement(id, false, airport)!.position;
    const node = {x: (lon - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (lat - airport.origin.lat) * 60};
    assert.ok(Math.hypot(position.x - node.x, position.y - node.y) * 1852 < 1, id);
    assert.ok(planTaxiRoute(airport, position, "06").error);
  }
  assert.deepEqual(buildTaxiGraph(airport), buildTaxiGraph(previous));
  assert.deepEqual(gatesFor(airport), []);
});
