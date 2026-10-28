import assert from "node:assert/strict";
import test from "node:test";
import {getAirport} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {buildTaxiGraph, planTaxiRoute} from "./taxi-routing";

test("Santiago A02 is offered once while both mapped lead-ins remain routable", () => {
  const airport = getAirport({airport: "SCEL"});
  const previous = getAirport({airport: "SCEL", airportDataVersion: "0f5ef86703e8e6cdeb4404d3ebc11a07336e18bfb0dbfbe4a0a2654b8d3441e6"});
  const oldLines = previous.features.filter(feature => feature.kind === "parking_position" && feature.name === "A02");
  assert.equal(oldLines.length, 2);
  assert.deepEqual(oldLines[0].points.at(-1), oldLines[1].points.at(-1));
  const alternatives = airport.features.filter(feature => feature.name === "A02");
  assert.equal(alternatives.filter(feature => feature.kind === "parking_position").length, 1);
  assert.equal(alternatives.filter(feature => feature.kind === "taxilane").length, 1);
  assert.deepEqual(alternatives.map(feature => feature.points), oldLines.map(feature => feature.points));
  assert.deepEqual(buildTaxiGraph(airport), buildTaxiGraph(previous));
  const gates = gatesFor(airport).filter(feature => feature.name === "A02");
  assert.equal(gates.length, 1);
  const position = standPlacement(gates[0].id, false, airport)!.position;
  assert.ok(planTaxiRoute(airport, position, "17R").path);
});
