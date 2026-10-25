import assert from "node:assert/strict";
import test from "node:test";
import {getAirport} from "./airports";
import {type RadioFacility, insideAirspace} from "./aviation";
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
