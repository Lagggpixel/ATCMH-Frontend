import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import coordinates from "./sofia-stands-35-38-coordinates.json";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Sofia general aviation stands 35–38 follow mapped curves and published checkpoints", () => {
  const airport = getAirport({airport: "LBSF"});
  const previous = getAirport({airport: "LBSF", airportDataVersion: "3580075f1832971beefbc882ac57319143ada3e8f3c3d11d88bfdbbc27b419d7"});
  // https://aip.rossiya-airlines.com/Bulgaria/AD_files/LB_AD_2_LBSF_37_38_en.pdf
  // https://bgvacc.org/resources/sops/LBSF_SOP.pdf
  for (const [name, lineId, lat, lon, reversed] of coordinates as [string, string, number, number, boolean][]) {
    assert.ok(!gatesFor(previous).some(gate => gate.name === name), name);
    const matches = gatesFor(airport).filter(gate => gate.name === name);
    assert.equal(matches.length, 1, name);
    const stand = matches[0], position = standPlacement(stand.id, false, airport)!;
    assert.equal(stand.id, `${lineId}-stand-${name}`);
    const chart = {x: (lon - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (lat - airport.origin.lat) * 60};
    assert.ok(Math.hypot(position.position.x - chart.x, position.position.y - chart.y) * 1852 < 1, name);
    assert.ok(position.heading < 30 || position.heading > 330, name);
    const remainder = airport.features.find(feature => feature.id === lineId)!;
    const original = previous.features.find(feature => feature.id === lineId)!;
    const restored = reversed ? [...remainder.points.slice(0, -1), ...stand.points.toReversed().slice(1)] : [...stand.points.slice(0, -1), ...remainder.points.slice(1)];
    assert.deepEqual(restored, original.points, name);
    for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position.position, end.id).path, `${name} to ${end.id}`);
  }
});
