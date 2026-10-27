import assert from "node:assert/strict";
import test from "node:test";
import {getAirport} from "./airports";
import {type RadioFacility, facilities, insideAirspace} from "./aviation";
import {airspaceOutlines, hitAirspaces, projectAirspaces} from "./scope-airspaces";

const airport = getAirport({airport: "EGPH"});

const {lat, lon} = airport.origin;

const boundary = [[lon - 1, lat - 1], [lon + 1, lat - 1], [lon + 1, lat + 1], [lon - 1, lat + 1]];

const source: RadioFacility[] = [true, false, false].map((active, i) => ({id: String(i), name: "Center", type: "center", mhz: "123.45", lat, lon, active, boundary}));

test("Airspaces off preserves active and selected outlines, including a selected inactive facility", () => {
  const airspaces = projectAirspaces(airport, undefined, source);
  assert.deepEqual(airspaceOutlines(airspaces, true, []).map(a => [a.id, a.width]), [["0", 3], ["1", 1], ["2", 1]]);
  assert.deepEqual(airspaceOutlines(airspaces, false, ["1"]).map(a => [a.id, a.width]), [["0", 3], ["1", 3]]);
  assert.deepEqual(airspaceOutlines(airspaces, false, ["1"], {"0": false, "2": true}).map(a => a.id), ["1", "2"]);
  assert.deepEqual(airspaceOutlines(airspaces, false, [], {"0": false}), []);
  assert.equal(source[0].active, true);
});

test("configured facility availability overrides the pinned defaults without dropping ordinary boundaries", () => {
  const airspaces = projectAirspaces(airport, [{...source[1], active: true, boundary: undefined}], source);
  assert.equal(airspaces.length, 3);
  assert.deepEqual(airspaceOutlines(airspaces, true, []).map(a => a.id), ["0", "1", "2"]);
  assert.deepEqual(airspaceOutlines(airspaces, false, []).map(a => a.id), ["1"]);
  const configured = projectAirspaces(airport, [{...source[1], active: true}], source);
  assert.deepEqual(airspaceOutlines(configured, false, []).map(a => a.id), ["1"]);
});

test("ordinary map taps select containing airspaces only while Airspaces is enabled", () => {
  const airspaces = projectAirspaces(airport, undefined, source);
  const selected = hitAirspaces(airspaces, airport, {x: 0, y: 0}, true);
  assert.deepEqual(selected, ["0", "1", "2"]);
  assert.deepEqual(hitAirspaces(airspaces, airport, {x: 0, y: 0}, false), []);
  assert.deepEqual(hitAirspaces(airspaces, airport, {x: 1000, y: 1000}, true), []);
  assert.equal(airspaceOutlines(airspaces, false, selected).length, 3);
});

test("Pacific airspaces do not incorrectly label airports across the antimeridian", () => {
  const boundary = [[170, -20], [-170, -20], [-170, 20], [170, 20]];
  assert.equal(insideAirspace(boundary, 0, 179), true); assert.equal(insideAirspace(boundary, 0, -179), true);
  assert.equal(insideAirspace(boundary, 0, -96), false);
});


test("date-line edges stay near the Pacific instead of crossing Heathrow", () => {
  const heathrow = getAirport({airport: "EGLL"});
  const anchorage = facilities.find(f => f.name === "ANCHORAGE OCEANIC" && f.boundary)!;
  assert.ok(anchorage);
  const projected = projectAirspaces(heathrow, undefined, [anchorage])[0];
  // The former 179.6E to 176.6W edge passed within 66 NM of Heathrow.
  for (const [a, b] of projected.segments) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / (dx * dx + dy * dy || 1)));
    assert.ok(Math.hypot(a.x + t * dx, a.y + t * dy) > 100);
  }
});

test("date-line and closing edges use the short arc on either side of the Pacific", () => {
  const ring = [[179, 0], [-179, 0], [-179, 2], [179, 2]];
  for (const originLon of [179.5, -179.5]) {
    const pacific = {...airport, origin: {...airport.origin, lat: 1, lon: originLon}};
    const projected = projectAirspaces(pacific, undefined, [{...source[0], boundary: ring}])[0];
    assert.equal(projected.segments.length, 4);
    for (const [a, b] of projected.segments) {
      assert.ok(Math.abs(a.x - b.x) <= 120);
      assert.ok(Math.abs(a.x) < 180 && Math.abs(b.x) < 180);
    }
    assert.deepEqual(hitAirspaces([projected], pacific, {x: 0, y: 0}, true), ["0"]);
  }
});

test("polar rings also project their closing edge independently", () => {
  const polar = {...airport, origin: {...airport.origin, lat: 80, lon: 0}};
  const ring = [[-170, 85], [-60, 85], [60, 85], [170, 85]];
  const projected = projectAirspaces(polar, undefined, [{...source[0], boundary: ring}])[0];
  const closing = projected.segments.at(-1)!;
  assert.ok(Math.abs(closing[1].x - closing[0].x) < 250);
});
