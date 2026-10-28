import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

test("Nice inferred apron connectors provide access to charted stands", () => {
  const airport = getAirport({airport: "LFMN", airportDataVersion: "a20a41b6dd665f39d084b4c386a1a2cc4fae5b5dc652520800d22beb8aa29ed0"});
  const previous = getAirport({airport: "LFMN", airportDataVersion: "15bad6d68cb9be876fd94dc604ab50044cfbcfa3d0d64d9b1ee9a4eb84b4e0eb"});
  const stands: readonly (readonly [string, number, number])[] = [["49A",43.65931111111111,7.210133333333333],["49B",43.65923333333333,7.210013888888889],["49C",43.65891111111111,7.209555555555556],["51A",43.65793333333333,7.207713888888889],["51B",43.657894444444445,7.207652777777778],["51C",43.65774722222222,7.207394444444445],["53A",43.65749722222222,7.207044444444445],["53B",43.65747222222222,7.207038888888889],["53C",43.657244444444444,7.206747222222222],["61B",43.66266944444444,7.214788888888889],["65B",43.66155,7.213219444444444],["69B",43.660402777777776,7.2115888888888895],["71A",43.65606666666667,7.205627777777778],["71B",43.655852777777774,7.205313888888889],["71C",43.65580555555555,7.2053],["71D",43.65609444444444,7.205663888888889],["71E",43.65593055555556,7.205466666666667],["71F",43.65577222222222,7.205258333333333],["73A",43.65551388888889,7.204922222222223],["73B",43.65530555555556,7.204572222222223],["73C",43.655274999999996,7.2045972222222225],["73D",43.655563888888885,7.204963888888889],["73E",43.655405555555554,7.204747222222222],["73F",43.65524444444444,7.204527777777778],["75F",43.654719444444446,7.203805555555555],["77",43.65444166666666,7.203497222222222]];
  for (const [name, lat, lon] of stands) {
    const stand = airport.features.find(feature => feature.kind === "parking_position" && feature.name === name)!;
    const connector = airport.features.find(feature => feature.id === `inferred-nice-${name.toLowerCase()}-connector`)!;
    assert.ok(!gatesFor(previous).some(gate => gate.id === stand.id), name);
    assert.ok(gatesFor(airport).some(gate => gate.id === stand.id), name);
    const position = standPlacement(stand.id, false, airport)!.position;
    assert.deepEqual(position, standPlacement(stand.id, false, previous)!.position);
    const chart = {x: (lon - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (lat - airport.origin.lat) * 60};
    assert.ok(Math.hypot(position.x - chart.x, position.y - chart.y) * 1852 < 15, name);
    assert.equal(connector.kind, "taxilane");
    const [join, start] = connector.points, next = stand.points[1];
    assert.deepEqual(start, stand.points[0]);
    const dx = start.x - next.x, dy = start.y - next.y, ex = join.x - start.x, ey = join.y - start.y;
    assert.ok(Math.hypot(ex, ey) * 1852 < 20, name);
    assert.ok(Math.abs(dx * ey - dy * ex) < 1e-10 && dx * ex + dy * ey > 0, name);
    for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position, end.id).path, `${name} to ${end.id}`);
  }
});
