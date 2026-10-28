import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Brasilia short mapped-apron gaps are connected without moving stand positions", () => {
  const airport = getAirport({airport: "SBBR"});
  const previous = getAirport({airport: "SBBR", airportDataVersion: "fc5d48b4411ce7420be2fc44162a4882da29b9d3272fb751c3044f897ae42f6c"});
  assert.deepEqual(airport.features.slice(0, previous.features.length), previous.features);
  for (const [name, id] of [["79", "1518457050"], ["80", "1518457051"], ["81", "1518457052"], ["82", "1518457053"]]) {
    assert.ok(!gatesFor(previous).some(gate => gate.id === id));
    assert.ok(gatesFor(airport).some(gate => gate.id === id));
    const stand = airport.features.find(f => f.id === id)!;
    const connector = airport.features.find(f => f.id === `inferred-brasilia-${name}-connector`)!;
    assert.deepEqual(connector.points[1], stand.points[0]);
    assert.ok(Math.hypot(connector.points[0].x - connector.points[1].x, connector.points[0].y - connector.points[1].y) * 1852 < .4);
    const point = standPlacement(id, false, airport)!.position;
    assert.deepEqual(point, standPlacement(id, false, previous)!.position);
    for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, point, end.id).path, `${name} ${end.id}`);
  }
});
