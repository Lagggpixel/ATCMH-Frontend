import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Auckland domestic stands use their charted ends instead of intermediate line segments", () => {
  const airport = getAirport({airport: "NZAA"});
  const prior = getAirport({airport: "NZAA", airportDataVersion: "c47e9c5c560b92888cc644f764cf826f81e01ad8c31b55312ded514125e4bddf"});
  const seconds: Record<string, [number, number]> = {"24": [27.12, 21.89], "28": [26.63, 23.03], "29": [25.51, 24.27], "30": [25.02, 26.09], "31": [25.85, 28.07], "32": [25.26, 28.93], "33": [24.33, 29.36]};
  const gates = gatesFor(airport);
  for (const [name, [latSeconds, lonSeconds]] of Object.entries(seconds)) {
    const matches = gates.filter(gate => gate.name === name);
    assert.equal(matches.length, 1, name);
    assert.ok(prior.features.filter(feature => feature.kind === "parking_position" && feature.name === name).length > 1, name);
    const lat = -(37 + latSeconds / 3600), lon = 174 + 47 / 60 + lonSeconds / 3600;
    const chartPoint = {x: (lon - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (lat - airport.origin.lat) * 60};
    const position = standPlacement(matches[0].id, false, airport)!.position;
    assert.ok(Math.hypot(position.x - chartPoint.x, position.y - chartPoint.y) * 1852 < 32, name);
    for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position, end.id).path, `${name} to ${end.id}`);
  }
});
