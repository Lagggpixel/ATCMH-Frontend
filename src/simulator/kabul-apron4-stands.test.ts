import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Kabul apron 4 mapped stand lines retain their positions and route to the runway", () => {
  const airport = getAirport({airport: "OAKB", airportDataVersion: "b95009e57b36877771e91b475f1c58ea1acde935a8da29a8639f6e4263adc79b"});
  const previous = getAirport({airport: "OAKB", airportDataVersion: "f08b4fa088ce3aef992d2b6653ab32ef629413f86f96ca676d8b1e74ddb668f7"});
  // Afghan AIP parking diagram, page 276: https://www.afgais.com/_files/ugd/a8bf88_5131b21bb783459dbd34c23e0d2ea380.pdf
  const stands = [["21", "945093829"], ["22", "945093832"], ["23", "945093835"]] as const;
  assert.equal(gatesFor(previous).length, 0);
  assert.equal(gatesFor(airport).length, stands.length);
  for (const [name, id] of stands) {
    const oldLine = previous.features.find(feature => feature.id === id)!;
    const gate = gatesFor(airport).find(feature => feature.id === id)!;
    assert.equal(oldLine.kind, "taxiway");
    assert.equal(gate.name, name);
    assert.deepEqual(gate.points, oldLine.points);
    const position = standPlacement(id, false, airport)!;
    assert.deepEqual(position.position, oldLine.points.at(-1));
    assert.ok(position.heading > 180 && position.heading < 225, name);
    for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position.position, end.id).path, `${name} to ${end.id}`);
  }
});
