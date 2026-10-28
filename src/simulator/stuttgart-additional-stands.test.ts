import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import stands from "./stuttgart-additional-stands.json";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Stuttgart mapped stands match named markers and charted areas and route to both runway ends", () => {
  const airport = getAirport({airport: "EDDS"});
  const previous = getAirport({airport: "EDDS", airportDataVersion: "51aa2638c7c4e6ed83e0189c86b845ba77052be50db4f3d596f26515ccb749c5"});
  assert.deepEqual(airport.features.slice(0, previous.features.length), previous.features);
  assert.equal(airport.features.length, previous.features.length + 40);
  assert.equal(gatesFor(airport).length, gatesFor(previous).length + 40);
  for (const stand of stands) {
    const gate = gatesFor(airport).find(item => item.id === stand.id)!;
    assert.equal(gate.name, stand.name);
    const position = standPlacement(stand.id, false, airport)!.position;
    const project = (lat: number, lon: number) => ({x: (lon - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (lat - airport.origin.lat) * 60});
    const marker = project(stand.marker[0], stand.marker[1]);
    const chart = project(48 + stand.chart[0] / 60, 9 + stand.chart[1] / 60);
    assert.ok(Math.hypot(position.x - marker.x, position.y - marker.y) * 1852 < 2, stand.name);
    assert.ok(Math.hypot(position.x - chart.x, position.y - chart.y) * 1852 < 125, stand.name);
    for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position, end.id).path, `${stand.name} to ${end.id}`);
  }
});
