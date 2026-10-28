import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Calgary mapped stands match the charted area and reach each runway", () => {
  const airport = getAirport({airport: "CYYC", airportDataVersion: "fa4e487817ef8962c5943bd840c3716fb24b891a927be0786dc0a08e2334536d"});
  const previous = getAirport({airport: "CYYC", airportDataVersion: "fc1689bf15fe5fe3d6ad1ad33bfc95f473d97ecba5551079ac1db00b62e03850"});
  // The source rounds stand coordinates to one tenth of a minute.
  const references: Record<string, [number, number]> = {"11": [7.9, .8], "13": [7.9, .9], "15": [7.9, .9], "17": [7.9, .9], "19": [8, .9], "20": [8, .9], "22": [7.9, .7], "23": [7.9, .7], "24": [7.9, .7], "31": [7.8, .7], "32": [7.8, .8], "33": [7.8, .7], "35": [7.8, .7], "39": [7.7, .8], "40": [7.7, .8], "52": [7.8, .6], "56": [7.7, .6], "58": [7.7, .6]};
  const gates = gatesFor(airport);
  assert.equal(gatesFor(previous).length, 0);
  assert.equal(gates.length, 23);
  for (const gate of gates) {
    const [latMinutes, lonMinutes] = references[gate.name.replace(/[AB]$/, "")];
    const point = {x: (-114 - lonMinutes / 60 - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (51 + latMinutes / 60 - airport.origin.lat) * 60};
    const position = standPlacement(gate.id, false, airport)!.position;
    assert.ok(Math.hypot(position.x - point.x, position.y - point.y) * 1852 < 125, gate.name);
    const [connection, mapped] = gate.points;
    assert.ok(Math.hypot(connection.x - mapped.x, connection.y - mapped.y) * 1852 <= 15, gate.name);
    for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position, end.id).path, `${gate.name} to ${end.id}`);
  }
});
