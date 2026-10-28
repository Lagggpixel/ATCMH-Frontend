import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Nice stand 17 uses its charted position rather than an apron junction", () => {
  const airport = getAirport({airport: "LFMN"});
  const previous = getAirport({airport: "LFMN", airportDataVersion: "0db8dd802ac5e6bd85ce2994926026a41211ce806f21d0124d0e1de5b7db9913"});
  assert.equal(gatesFor(previous).filter(gate => gate.name === "17").length, 2);
  const matches = gatesFor(airport).filter(gate => gate.name === "17");
  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, "1224619676");
  const position = standPlacement(matches[0].id, false, airport)!.position;
  const chart = {x: (7 + 12 / 60 + 41.39 / 3600 - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (43 + 39 / 60 + 45.13 / 3600 - airport.origin.lat) * 60};
  assert.ok(Math.hypot(position.x - chart.x, position.y - chart.y) * 1852 < 1);
  for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position, end.id).path, end.id);
  const oldLine = previous.features.find(feature => feature.id === matches[0].id)!;
  const tail = airport.features.find(feature => feature.id === "1224619676-continuation")!;
  assert.equal(tail.kind, "taxilane");
  assert.deepEqual(tail.points[0], position);
  assert.deepEqual(tail.points.at(-1), oldLine.points.at(-1));
  assert.equal(airport.features.find(feature => feature.id === "1225239343")!.kind, "taxilane");
});
