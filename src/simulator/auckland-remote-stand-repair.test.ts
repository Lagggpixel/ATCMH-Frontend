import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Auckland remote stand selections end at mapped parking nodes while retaining every centerline segment", () => {
  const airport = getAirport({airport: "NZAA"});
  const previous = getAirport({airport: "NZAA", airportDataVersion: "581f501d75c6ac3523b290d59c8dbb782ac988a03fa69c1dcc145a659e55993f"});
  const stands = [["34", "1098354112", -37.0066971, 174.7922700], ["35", "1098355442", -37.0066159, 174.7923681], ["36", "1098355449", -37.0068757, 174.7923383], ["50A", "1099687104", -37.0049241, 174.7933178], ["50B", "1099688353", -37.0048544, 174.7932579], ["50C", "1099689051", -37.0046472, 174.7933042]] as const;
  const gates = gatesFor(airport), names = new Set(stands.map(([name]) => name as string));
  for (const [name, id, lat, lon] of stands) {
    const matches = gates.filter(gate => gate.name === name);
    const connected = name === "50A" || name === "50B";
    assert.equal(matches.length, connected ? 1 : 0, name);
    if (connected) assert.equal(matches[0].id, id);
    const position = standPlacement(id, false, airport)!.position;
    const node = {x: (lon - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (lat - airport.origin.lat) * 60};
    assert.ok(Math.hypot(position.x - node.x, position.y - node.y) * 1852 < 1, name);
    for (const end of runwayEnds(airport)) {
      const route = planTaxiRoute(airport, position, end.id);
      if (connected) assert.ok(route.path, `${name} to ${end.id}`);
      else assert.ok(route.error, `${name} remains disconnected`);
    }
  }
  const segments = (features: typeof airport.features) => features.filter(feature => names.has(feature.name)).flatMap(feature => feature.points.slice(1).map((point, i) => JSON.stringify([feature.points[i], point]))).sort();
  assert.deepEqual(segments(airport.features), segments(previous.features));
});
