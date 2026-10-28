import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Düsseldorf mapped stands are connected and the older snapshot remains available", () => {
  const airport = getAirport({airport: "EDDL"});
  const previous = getAirport({airport: "EDDL", airportDataVersion: "91d02c8560f2c0f26ff16d0a90927ea12207c55c1ed28f6ced8e132a375d157a"});
  const beforeExtra = getAirport({airport: "EDDL", airportDataVersion: "86358f444ab1f46441ad4bcd627776fc5f4dadf74f7b37c1b02943d95add37f8"});
  const priorIds = new Set(gatesFor(beforeExtra).map(gate => gate.id));
  const gates = gatesFor(airport).filter(gate => priorIds.has(gate.id));
  assert.equal(gatesFor(previous).length, 0);
  assert.deepEqual(new Set(gates.map(gate => gate.name)), new Set(["B05", "B07", "B09", "B11", "A08", "A16", "B08", "B10", "V50"]));
  // The chart rounds these coordinates to one tenth of a minute.
  const references: Record<string, [number, number]> = {B09: [16.8, 45.8], B11: [16.7, 45.8], A08: [17.0, 46.0], A16: [16.8, 45.9]};
  for (const gate of gates) {
    const position = standPlacement(gate.id, false, airport)!.position;
    if (references[gate.name]) {
      const [latMinutes, lonMinutes] = references[gate.name], lat = 51 + latMinutes / 60, lon = 6 + lonMinutes / 60;
      const point = {x: (lon - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (lat - airport.origin.lat) * 60};
      assert.ok(Math.hypot(position.x - point.x, position.y - point.y) * 1852 < 110, gate.name);
    }
    for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position, end.id).path, `${gate.name} to ${end.id}`);
  }
});

test("Düsseldorf added stands use mapped parking nodes and reach all runways", () => {
  const airport = getAirport({airport: "EDDL", airportDataVersion: "fefed59cd6525996fb84b35499dbbbf98744de5d8730422c5607b7ae198e4a54"});
  const previous = getAirport({airport: "EDDL", airportDataVersion: "86358f444ab1f46441ad4bcd627776fc5f4dadf74f7b37c1b02943d95add37f8"});
  const references: Record<string, [number, number]> = {V63: [16.7,45.6], V80: [16.7,45.4], V62: [16.8,45.6], V61A: [16.8,45.6]};
  assert.equal(gatesFor(previous).length, 9);
  assert.equal(gatesFor(airport).length, 17);
  for (const [name, [latMinutes, lonMinutes]] of Object.entries(references)) {
    const gate = gatesFor(airport).find(stand => stand.name === name)!;
    assert.ok(gate, name);
    const point = {x: (6 + lonMinutes / 60 - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (51 + latMinutes / 60 - airport.origin.lat) * 60};
    const position = standPlacement(gate.id, false, airport)!.position;
    assert.ok(Math.hypot(position.x - point.x, position.y - point.y) * 1852 < 125, name);
    for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position, end.id).path, `${name} to ${end.id}`);
  }
});

test("Düsseldorf stands with short inferred joins remain in their charted areas", () => {
  const airport = getAirport({airport: "EDDL"});
  const previous = getAirport({airport: "EDDL", airportDataVersion: "ed08cb00e325fc89f31d5d1a8bf56369610ddecd8724bb181b015133d255e184"});
  const references: Record<string, [number, number]> = {V47: [17,46.3], V48: [17,46.3], V49: [17,46.3], V61: [16.8,45.6]};
  assert.equal(gatesFor(previous).length, 13);
  for (const [name, [latMinutes, lonMinutes]] of Object.entries(references)) {
    const gate = gatesFor(airport).find(stand => stand.name === name)!;
    assert.ok(gate, name);
    const point = {x: (6 + lonMinutes / 60 - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (51 + latMinutes / 60 - airport.origin.lat) * 60};
    const position = standPlacement(gate.id, false, airport)!.position;
    assert.ok(Math.hypot(position.x - point.x, position.y - point.y) * 1852 < 125, name);
    assert.ok(Math.hypot(gate.points[0].x - gate.points[1].x, gate.points[0].y - gate.points[1].y) * 1852 < 15, name);
    for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position, end.id).path, `${name} to ${end.id}`);
  }
});
