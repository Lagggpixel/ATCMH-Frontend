import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import type {Point} from "./model";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";

const inside = (point: Point, polygon: Point[]) => {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
};
test("Düsseldorf seven mapped terminal stands use apron-contained inferred joins", () => {
  const airport = getAirport({airport: "EDDL", airportDataVersion: "076e383f271aa8f44a8b4bab668f6575df1d55350b6e09871da8794d231f4795"});
  const previous = getAirport({airport: "EDDL", airportDataVersion: "cc6eff86b2acfa32fa0a2f8731401e234f8b9aaf10f351e70949b58f12165b1b"});
  assert.deepEqual(airport.features.slice(0, previous.features.length), previous.features);
  assert.equal(gatesFor(airport).length, gatesFor(previous).length + 7);
  const aprons = airport.features.filter(f => f.kind === "apron").map(f => f.points);
  for (const [name, id, lat, lon] of [["A03", "1009877591", 51.281564, 6.7671001], ["A12", "1009877605", 51.2814878, 6.7655942], ["A13", "1009877609", 51.2810753, 6.7655821], ["B01", "1009877614", 51.2800474, 6.764115], ["B02", "1009877616", 51.2803015, 6.763624], ["C02", "1009877636", 51.2774019, 6.7625857], ["C02A", "1009877638", 51.2773283, 6.7624969]] as const) {
    const stand = gatesFor(airport).find(f => f.id === `${id}-stand`)!;
    assert.equal(stand.name, name);
    const position = standPlacement(stand.id, false, airport)!.position;
    const marker = {x: (lon - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (lat - airport.origin.lat) * 60};
    assert.ok(Math.hypot(position.x - marker.x, position.y - marker.y) * 1852 < 2, name);
    const branch = airport.features.find(f => f.id === id)!;
    assert.equal(branch.kind, "taxilane"); assert.ok(branch.points.some(p => p.x === position.x && p.y === position.y));
    const connector = airport.features.find(f => f.id === `inferred-dusseldorf-${name.toLowerCase()}-connector`)!;
    const [join, start] = connector.points, next = stand.points[1];
    assert.deepEqual(start, stand.points[0]);
    const dx = start.x - next.x, dy = start.y - next.y, ex = join.x - start.x, ey = join.y - start.y;
    assert.ok(Math.hypot(ex, ey) * 1852 < 45, name);
    assert.ok(Math.abs(dx * ey - dy * ex) < 1e-10 && dx * ex + dy * ey > 0, name);
    for (let i = 0; i <= 20; i++) assert.ok(aprons.some(polygon => inside({x: join.x + (start.x - join.x) * i / 20, y: join.y + (start.y - join.y) * i / 20}, polygon)), name);
    for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position, end.id).path, `${name} ${end.id}`);
  }
});
