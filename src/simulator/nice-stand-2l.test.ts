import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {buildTaxiGraph, planTaxiRoute} from "./taxi-routing";

test("Nice stand 2L stops at its published checkpoint and retains both branches", () => {
  const airport = getAirport({airport: "LFMN", airportDataVersion: "2c606c5f99b199f0f79a5a0ea81be388c12414945a58ddca73a0d72a173c80cd"});
  const previous = getAirport({airport: "LFMN", airportDataVersion: "83f5bcb3443991b7802dae5e6026517d04dd80d9c3dbd254a4ea06ca8311237d"});
  assert.equal(gatesFor(previous).filter(gate => gate.name === "2L").length, 2);
  const matches = gatesFor(airport).filter(gate => gate.name === "2L");
  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, "962258894");
  const position = standPlacement(matches[0].id, false, airport)!.position;
  const chart = {x: (7 + 13 / 60 + 1.51 / 3600 - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (43 + 39 / 60 + 58.46 / 3600 - airport.origin.lat) * 60};
  assert.ok(Math.hypot(position.x - chart.x, position.y - chart.y) * 1852 < 1);
  const prior = previous.features.find(feature => feature.id === "962258894")!;
  const tail = airport.features.find(feature => feature.id === "962258894-continuation")!;
  assert.equal(tail.kind, "taxilane");
  assert.deepEqual([...matches[0].points, ...tail.points.slice(1)], prior.points);
  assert.equal(airport.features.find(feature => feature.id === "962258895")!.kind, "taxilane");
  assert.deepEqual(buildTaxiGraph(airport), buildTaxiGraph(previous));
  for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position, end.id).path, end.id);
});
