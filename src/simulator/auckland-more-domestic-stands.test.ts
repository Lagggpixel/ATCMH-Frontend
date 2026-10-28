import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Auckland domestic stand stopping positions match mapped nodes and retain taxi lines", () => {
  const airport = getAirport({airport: "NZAA"});
  const previous = getAirport({airport: "NZAA", airportDataVersion: "6317fb31dc98b9cc9324221dba839787b99dab5a7357c1d3f16e4e29b2afbb02"});
  const stands: readonly (readonly [string, string, number, number])[] = [["20","1098349183",-37.0068596,174.7888008],["21","1098349184",-37.0072044,174.7889508],["22","1098349225",-37.0075437,174.7891173],["40E","1098356662",-37.0067178,174.7929311],["40W","1098356664",-37.0067757,174.7927213],["42","1098359170",-37.0061334,174.793348],["39","1098359171",-37.0062931,174.7927351],["41E","1098359173",-37.0063013,174.7931822],["41W","1098359179",-37.00636,174.7929698],["45","1099626024",-37.0065153,174.7939197],["46","1099626282",-37.0060659,174.7936565],["47","1099626472",-37.0058696,174.7934709],["48","1099627379",-37.0055801,174.793338],["48W","1099627382",-37.0055849,174.793509],["55","1099682415",-37.0056138,174.79452],["53","1099683660",-37.0052399,174.7942931],["51","1099683664",-37.0049236,174.7941585],["49","1099686187",-37.0052757,174.7931899],["50","1099686188",-37.0049772,174.7930609]];
  const disconnected = new Set(["39", "40E", "40W", "41E", "41W", "42"]);
  const names = new Set(stands.map(([name]) => name)), gates = gatesFor(airport);
  for (const [name, id, lat, lon] of stands) {
    const matches = gates.filter(gate => gate.name === name), connected = !disconnected.has(name);
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
  const segments = (features: typeof airport.features) => features.filter(feature => names.has(feature.name)).flatMap(feature => feature.points.slice(1).map((point, i) => [JSON.stringify(feature.points[i]), JSON.stringify(point)].sort().join("|"))).sort();
  assert.deepEqual(segments(airport.features), segments(previous.features));
});
