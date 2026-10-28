import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Salt Lake mapped stands match the charted area and reach each runway", () => {
  const airport = getAirport({airport: "KSLC"});
  const previous = getAirport({airport: "KSLC", airportDataVersion: "403e4618cd4f34cd1e7e6c832155e089db9517c9c4d3d82766a00d0568c2d575"});
  const gates = gatesFor(airport);
  assert.equal(gatesFor(previous).length, 0);
  assert.equal(gates.length, 46);
  for (const gate of gates) {
    const n = Number(gate.name.slice(1).replace("A", ""));
    const latMinutes = gate.name.startsWith("A") ? (n % 2 === 0 || n <= 12 ? 47.1 : 47.2) : (n === 1 || n % 2 === 0 ? 47.3 : 47.4);
    const lonMinutes = gate.name.startsWith("A") ? (n <= 8 ? 59.5 : n <= 14 ? 59.4 : n <= 20 ? 59.3 : 59.2) : (n <= 4 ? 59.5 : n <= 10 ? 59.4 : n <= 14 || n === 16 ? 59.3 : n === 24 ? 59.1 : 59.2);
    const chart = {x: (-111 - lonMinutes / 60 - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (40 + latMinutes / 60 - airport.origin.lat) * 60};
    const position = standPlacement(gate.id, false, airport)!.position;
    assert.ok(Math.hypot(position.x - chart.x, position.y - chart.y) * 1852 < 125, gate.name);
    const [connection, mapped] = gate.points;
    assert.ok(Math.hypot(connection.x - mapped.x, connection.y - mapped.y) * 1852 <= 15, gate.name);
    for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position, end.id).path, `${gate.name} to ${end.id}`);
  }
});
