import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Nice stand 15 has its published label and checkpoint position", () => {
  const airport = getAirport({airport: "LFMN"});
  const previous = getAirport({airport: "LFMN", airportDataVersion: "1544d834ccb81903ac1785f3e1bb42602a622d9112956d86e6e1e8a765b94655"});
  assert.ok(gatesFor(previous).some(gate => gate.name === "15;"));
  const matches = gatesFor(airport).filter(gate => gate.name === "15");
  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, "249936356");
  const position = standPlacement(matches[0].id, false, airport)!.position;
  const chart = {x: (7 + 12 / 60 + 41.07 / 3600 - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (43 + 39 / 60 + 43.46 / 3600 - airport.origin.lat) * 60};
  assert.ok(Math.hypot(position.x - chart.x, position.y - chart.y) * 1852 < 1);
  const tail = airport.features.find(feature => feature.id === "249936356-continuation")!;
  assert.equal(tail.kind, "taxilane");
  assert.deepEqual(tail.points[0], position);
  assert.deepEqual(tail.points.at(-1), previous.features.find(feature => feature.id === "249936356")!.points.at(-1));
  for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position, end.id).path, end.id);
});
