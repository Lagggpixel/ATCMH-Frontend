import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import coordinates from "./sofia-stands-17-34-coordinates.json";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Sofia stands 17–34 use published checkpoints on their mapped lines", () => {
  const airport = getAirport({airport: "LBSF"});
  const previous = getAirport({airport: "LBSF", airportDataVersion: "46944c0d931319edbdaaefa3a8e46e43b04b2d7f716d84d7a9cbfa077b0ee3d3"});
  // 2012 checkpoints: https://aip.rossiya-airlines.com/Bulgaria/AD_files/LB_AD_2_LBSF_37_38_en.pdf
  // 2026 apron layout: https://bgvacc.org/resources/sops/LBSF_SOP.pdf
  for (const [name, lineId, lat, lon] of coordinates as [string, string, number, number][]) {
    const id = `${lineId}-stand-${name}`;
    assert.ok(!gatesFor(previous).some(gate => gate.name === name), name);
    const matches = gatesFor(airport).filter(gate => gate.name === name);
    assert.equal(matches.length, 1, name);
    assert.equal(matches[0].id, id);
    const position = standPlacement(id, false, airport)!.position;
    const chart = {x: (lon - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (lat - airport.origin.lat) * 60};
    assert.ok(Math.hypot(position.x - chart.x, position.y - chart.y) * 1852 < 1, name);
    const line = airport.features.find(feature => feature.id === lineId)!;
    assert.equal(line.kind, "taxiway");
    assert.deepEqual(line.points[0], position);
    assert.deepEqual(line.points.at(-1), previous.features.find(feature => feature.id === lineId)!.points.at(-1));
    for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position, end.id).path, `${name} to ${end.id}`);
  }
});
