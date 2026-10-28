import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Edinburgh 400-series stands match the mapped parking nodes", () => {
  const airport = getAirport({airport: "EGPH"});
  // Current mapped nodes: https://www.openstreetmap.org/way/1554521752
  const stands = [["403", "1554521752", 55.9490940, -3.3545280], ["404", "1554521753", 55.9489030, -3.3538940], ["405", "1554521754", 55.9487030, -3.3532640], ["406", "1554521755", 55.9485140, -3.3526330], ["407", "1554521756", 55.9483220, -3.3520030]] as const;
  const gates = gatesFor(airport);
  for (const [name, id, lat, lon] of stands) {
    const matches = gates.filter(gate => gate.name === name);
    assert.equal(matches.length, 1, name);
    assert.equal(matches[0].id, id);
    const position = standPlacement(id, false, airport)!.position;
    const node = {x: (lon - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (lat - airport.origin.lat) * 60};
    assert.ok(Math.hypot(position.x - node.x, position.y - node.y) * 1852 < 1, name);
    for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position, end.id).path, `${name} to ${end.id}`);
  }
});
