import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Auckland international and remote stand nodes replace duplicate branch selections", () => {
  const airport = getAirport({airport: "NZAA"});
  const previous = getAirport({airport: "NZAA", airportDataVersion: "ffbda694722f7354fa97adb1baff63bb761fd7125c33ec7964e2182cbf23bd5a"});
  const stands: readonly (readonly [string, string, number, number])[] = [["7","1097803686",-37.0076904,174.7814794],["78","1097803692",-37.007761,174.7787375],["5","1097805375",-37.0073046,174.7815325],["3","1097805378",-37.0067526,174.7818446],["1","1097805382",-37.0062726,174.7821401],["15","1097805385",-37.0045985,174.7798017],["15L","1097805857",-37.0048887,174.7796639],["16","1097806504",-37.0048343,174.7788614],["16R","1097806505",-37.0047939,174.7789145],["16L","1097806506",-37.0051467,174.7787348],["79","1097807785",-37.0068966,174.7790232]];
  const names = new Set(stands.map(([name]) => name)), gates = gatesFor(airport);
  for (const [name, id, lat, lon] of stands) {
    const matches = gates.filter(gate => gate.name === name);
    assert.equal(matches.length, 1, name);
    assert.equal(matches[0].id, id);
    const position = standPlacement(id, false, airport)!.position;
    const node = {x: (lon - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (lat - airport.origin.lat) * 60};
    assert.ok(Math.hypot(position.x - node.x, position.y - node.y) * 1852 < 1, name);
    for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position, end.id).path, `${name} to ${end.id}`);
  }
  const segments = (features: typeof airport.features) => features.filter(feature => names.has(feature.name)).flatMap(feature => feature.points.slice(1).map((point, i) => [JSON.stringify(feature.points[i]), JSON.stringify(point)].sort().join("|"))).sort();
  assert.deepEqual(segments(airport.features), segments(previous.features));
});
