import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";
import chart from "./istanbul-chart4-coordinates.json";
import otherCharts from "./istanbul-chart123-coordinates.json";

test("Istanbul chart-matched stands are positioned and connected to each runway", () => {
  const airport = getAirport({airport: "LTFM"});
  const previous = getAirport({airport: "LTFM", airportDataVersion: "9c342cf32094f2e766289f5f1a1f6ef2259f14332f978e758cf221f30944aee2"});
  const gates = gatesFor(airport);
  assert.equal(previous.features.filter(feature => feature.kind === "parking_position").length, 0);
  assert.equal(chart.coordinates.length, 64);
  assert.equal(gates.length, 380);
  for (const [name, latitude, longitude] of chart.coordinates) {
    assert.equal(typeof name, "string");
    assert.equal(typeof latitude, "number");
    assert.equal(typeof longitude, "number");
    if (typeof name !== "string" || typeof latitude !== "number" || typeof longitude !== "number") continue;
    const matches = gates.filter(gate => gate.name === name);
    assert.equal(matches.length, 1, name);
    const chartPoint = {x: (longitude - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (latitude - airport.origin.lat) * 60};
    const position = standPlacement(matches[0].id, false, airport)!.position;
    assert.ok(Math.hypot(position.x - chartPoint.x, position.y - chartPoint.y) * 1852 < 15, name);
    for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position, end.id).path, `${name} to ${end.id}`);
  }
});

test("Istanbul terminal and apron stands match their charts and connect to the runway network", () => {
  const airport = getAirport({airport: "LTFM"});
  const previous = getAirport({airport: "LTFM", airportDataVersion: "7d673119936018e71e9136342cd5e39c624241baf35a864bca29a47cc0e91486"});
  const gates = gatesFor(airport);
  assert.equal(gatesFor(previous).length, 64);
  assert.equal(otherCharts.coordinates.length, 316);
  for (const [name, latitude, longitude] of otherCharts.coordinates) {
    assert.equal(typeof name, "string");
    assert.equal(typeof latitude, "number");
    assert.equal(typeof longitude, "number");
    if (typeof name !== "string" || typeof latitude !== "number" || typeof longitude !== "number") continue;
    const matches = gates.filter(gate => gate.name === name);
    assert.equal(matches.length, 1, name);
    const chartPoint = {x: (longitude - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (latitude - airport.origin.lat) * 60};
    const position = standPlacement(matches[0].id, false, airport)!.position;
    assert.ok(Math.hypot(position.x - chartPoint.x, position.y - chartPoint.y) * 1852 < 15, name);
    for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position, end.id).path, `${name} to ${end.id}`);
  }
});
