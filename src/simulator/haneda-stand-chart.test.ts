import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Haneda mapped stands match the charted area and reach each runway", () => {
  const airport = getAirport({airport: "RJTT"});
  const previous = getAirport({airport: "RJTT", airportDataVersion: "bda500eafd792aab2f82f98a3efca127c77619a278fbd9e757de4e21f2839116"});
  // Chart coordinates are rounded to one tenth of a minute.
  const references: Record<string, [number, number]> = {"1": [32.7, 47.3], "2": [32.7, 47.2], "3": [32.7, 47.2], "4": [32.7, 47.1], "5": [32.7, 47.1], "6": [32.7, 47.1], "7": [32.7, 47.1], "8": [32.8, 47.1], "9": [32.8, 47.1], "10": [32.8, 47.1], "11": [32.9, 47], "12": [32.9, 47], "13": [32.9, 47], "16": [33, 46.9], "17": [33.1, 46.9], "18": [33.1, 46.8], "19": [33.1, 46.8], "20": [33.1, 46.8], "21": [33.1, 46.8], "22": [33.1, 46.9]};
  const gates = gatesFor(airport).filter(gate => Object.hasOwn(references, gate.name));
  assert.equal(gatesFor(previous).length, 0);
  assert.deepEqual(new Set(gates.map(gate => gate.name)), new Set(Object.keys(references)));
  for (const gate of gates) {
    const [latMinutes, lonMinutes] = references[gate.name];
    const point = {x: (139 + lonMinutes / 60 - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (35 + latMinutes / 60 - airport.origin.lat) * 60};
    const position = standPlacement(gate.id, false, airport)!.position;
    assert.ok(Math.hypot(position.x - point.x, position.y - point.y) * 1852 < 125, gate.name);
    for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position, end.id).path, `${gate.name} to ${end.id}`);
  }
});
