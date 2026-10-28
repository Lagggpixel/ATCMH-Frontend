import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Sofia stands 12–16 use published checkpoints on mapped apron lines", () => {
  const airport = getAirport({airport: "LBSF"});
  const previous = getAirport({airport: "LBSF", airportDataVersion: "a7b41f0e5c1b1b061ba6a73d10c6d0f3d052e8868e5adebb7932ce4fce511312"});
  // 2018 coordinates: https://www.mtc.government.bg/sites/default/files/uploads/zveno/avio-2021/en_fr_g-euul_26012019_final_p.pdf
  // 2026 layout cross-check: https://bgvacc.org/resources/sops/LBSF_SOP.pdf
  const stands: readonly (readonly [string, string, number, number])[] = [["13","943807530-stand-13",42.690149999999996,23.410844444444443],["14","943807532-stand-14",42.68986388888889,23.410091666666666],["15","943807535-stand-15",42.68977222222222,23.409252777777777],["16","943807536-stand-16",42.689575,23.40854444444444],["12","943823779-stand-12",42.69044444444444,23.411447222222222]];
  const gates = gatesFor(airport);
  for (const [name, id, lat, lon] of stands) {
    assert.ok(!gatesFor(previous).some(gate => gate.name === name), name);
    const matches = gates.filter(gate => gate.name === name);
    assert.equal(matches.length, 1, name);
    assert.equal(matches[0].id, id);
    const position = standPlacement(id, false, airport)!.position;
    const chart = {x: (lon - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (lat - airport.origin.lat) * 60};
    assert.ok(Math.hypot(position.x - chart.x, position.y - chart.y) * 1852 < 1.5, name);
    const lineId = id.slice(0, id.indexOf("-stand-"));
    const line = airport.features.find(feature => feature.id === lineId)!;
    assert.equal(line.kind, "taxiway");
    assert.deepEqual(line.points[0], position);
    assert.deepEqual(line.points.at(-1), previous.features.find(feature => feature.id === lineId)!.points.at(-1));
    for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position, end.id).path, `${name} to ${end.id}`);
  }
});
