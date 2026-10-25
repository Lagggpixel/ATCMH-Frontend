import assert from "node:assert/strict";
import test from "node:test";
import type {ScopeAirport} from "./airport-display";
import {hitAirports} from "./airport-display";
import {airportList, getAirport, runwayEnds} from "./airports";
import runwayIls from "./data/runway-ils.json";
import {airportApproachGuides, airportRunwayLengths, approachStyle, directApproachesVisible, hitAirportSymbols, layoutAirportSymbols, mapCameraAltitude, mapPathVisible, projectMapPoint, runwayNumbersVisible, type MapApproach} from "./scope-airport-rendering";

const size = {width: 1000, height: 800}, camera = {center: {x: 0, y: 0}, scale: 10};
const field = (identifier: string, x: number, y: number, isTowered = true, length = 10000): ScopeAirport =>
  ({identifier, point: {x, y}, name: identifier, isTowered, longestRunwayLengthFeet: length});
const nearby: MapApproach[] = [{airportIcao: "TEST", runway: "01", threshold: {x: 20, y: 0}, departure: {x: 20, y: 1}, ils: false, localizer: true}];

test("map zoom converts pixels/NM to IF camera metres using vertical FOV and CSS viewport height", () => {
  const scale = 800 * 1852 / (2 * Math.tan(Math.PI / 8) * 80000);
  assert.ok(Math.abs(mapCameraAltitude({scale}, size) - 80000) < 1e-8);
  assert.equal(mapCameraAltitude({scale: 20}, size), mapCameraAltitude(camera, {height: 400}));
  assert.equal(mapCameraAltitude(camera, {height: 800}), mapCameraAltitude(camera, size));
  assert.equal(runwayNumbersVisible(79999.9), true); assert.equal(runwayNumbersVisible(80000), false);
  assert.equal(directApproachesVisible(799999.9), true); assert.equal(directApproachesVisible(800000), false);
});

test("screen declutter prioritizes longer runways, with optional IF importance then stable identifier ties", () => {
  const airports = [field("SMAL", 1, 0, true, 2000), field("LARG", 0, 0, true, 12000), field("FAR", 30, 0)];
  assert.deepEqual(layoutAirportSymbols(airports, camera, size, "CTRL", undefined, true).map(s => s.airport.identifier), ["LARG", "FAR"]);
  const equal = [field("BBBB", 0, 0), field("AAAA", 0, 0)];
  assert.equal(layoutAirportSymbols(equal, camera, size, "CTRL", undefined, true)[0].airport.identifier, "AAAA");
  equal[0].importance = 1; equal[1].importance = 2;
  assert.equal(layoutAirportSymbols(equal, camera, size, "CTRL", undefined, true)[0].airport.identifier, "BBBB");
});

test("zoom separates overlapping airport labels; drawing and hit testing share the visible list", () => {
  const airports = [field("AAAA", 0, 0), field("BBBB", 2, 0)];
  const zoomedOut = layoutAirportSymbols(airports, camera, size, "CTRL", undefined, true);
  const zoomedIn = layoutAirportSymbols(airports, {...camera, scale: 30}, size, "CTRL", undefined, true);
  assert.equal(zoomedOut.length, 1); assert.equal(zoomedIn.length, 2);
  assert.deepEqual(hitAirports(zoomedOut.map(s => s.airport), projectMapPoint(airports[1].point, camera, size), p => projectMapPoint(p, camera, size)).map(a => a.identifier), ["AAAA"]);
});

test("controlled and selected fields survive declutter and uncontrolled filtering, without confusing tower status with staffing", () => {
  const airports = [field("CTRL", 0, 0, false), field("SELE", .5, 0, false), field("BLUE", 20, 0), field("PINK", -20, 0, false)];
  const shown = layoutAirportSymbols(airports, camera, size, "CTRL", "SELE", false);
  assert.deepEqual(new Set(shown.map(s => s.airport.identifier)), new Set(["CTRL", "SELE", "BLUE"]));
  assert.equal(shown.find(s => s.airport.identifier === "BLUE")!.airport.isTowered, true);
  assert.equal(layoutAirportSymbols(airports, camera, size, "CTRL", undefined, true).some(s => s.airport.identifier === "PINK"), true);
});

test("viewport culling preserves an airport at the screen edge and a cone crossing from an offscreen airport", () => {
  assert.equal(layoutAirportSymbols([field("EDGE", 54, 0), field("AWAY", 60, 0)], camera, size, "CTRL", undefined, true).length, 1);
  assert.equal(mapPathVisible([{x: -100, y: 0}, {x: 100, y: 0}], camera, size), true);
  assert.equal(mapPathVisible([{x: 60, y: 0}, {x: 70, y: 0}], camera, size), false);
});

test("airport names above their icons are clickable while suppressed labels cannot capture taps", () => {
  const symbols = layoutAirportSymbols([field("LARG", 0, 0), field("SMAL", .1, 0, true, 1000)], camera, size, "CTRL", undefined, true);
  assert.deepEqual(hitAirportSymbols(symbols, {x: 500, y: 365}).map(a => a.identifier), ["LARG"]);
  assert.deepEqual(hitAirportSymbols(symbols, {x: 500, y: 400}).map(a => a.identifier), ["LARG"]);
  assert.deepEqual(hitAirportSymbols(symbols, {x: 500, y: 340}), []);
});

test("all supported airports keep each runway end and color by localizer, independent of scenario procedures", () => {
  const capabilities: Record<string, Record<string, {localizer: boolean}>> = runwayIls.airports;
  for (const airport of airportList) {
    const guides = airportApproachGuides(airport, []);
    assert.equal(guides.length, runwayEnds(airport).length);
    for (const item of guides) assert.equal(item.guide.color, capabilities[airport.icao][item.runway].localizer ? "#dc6464" : "#808080", `${airport.icao} ${item.runway}`);
  }
  const loc = airportApproachGuides(getAirport(), nearby).find(item => item.airportIcao === "TEST")!;
  assert.equal(loc.guide.color, "#dc6464"); assert.equal(nearby[0].ils, false);
});

test("approach switches preserve controlled cones and selected direct cones but respect non-towered background filtering", () => {
  const airport = getAirport(), guides = airportApproachGuides(airport, nearby), current = guides[0], other = guides.at(-1)!;
  const towered = new Map([[airport.icao, true], ["TEST", false]]), off = {approaches: false, uncontrolledAirports: false};
  assert.deepEqual(approachStyle(current, airport.icao, undefined, towered, off, 100000, true), {width: .75, direct: false});
  assert.equal(approachStyle(other, airport.icao, undefined, towered, off, 100000, true), undefined);
  assert.deepEqual(approachStyle(other, airport.icao, "TEST", towered, off, 100000, true), {width: 2, direct: true});
  assert.equal(approachStyle(other, airport.icao, "TEST", towered, off, 800000, true), undefined);
  assert.equal(approachStyle(other, airport.icao, undefined, towered, {approaches: true, uncontrolledAirports: false}, 100000, true), undefined);
  assert.deepEqual(approachStyle(other, airport.icao, undefined, towered, {approaches: true, uncontrolledAirports: true}, 900000, true), {width: .75, direct: false});
  assert.deepEqual(approachStyle(current, airport.icao, undefined, towered, off, 799999, false), {width: 2, direct: true});
  assert.equal(approachStyle(current, airport.icao, undefined, towered, off, 800000, false), undefined);
});

test("runway lengths aggregate reciprocal ends for priority without requiring provider schema changes", () => {
  const lengths = airportRunwayLengths([...nearby, {...nearby[0], runway: "19", threshold: nearby[0].departure, departure: nearby[0].threshold}]);
  assert.ok(Math.abs(lengths.get("TEST")! - 6076.11549) < 1e-8);
});
