import assert from "node:assert/strict";
import test from "node:test";
import {getAirport} from "./airports";
import {departureAirports, nearestDepartureAirport, nearestScenarioDeparture} from "./departure-airports";
import type {ScopeMapData} from "./scope-map-data";

test("departure airport catalogue requires elevation and runway geometry and retains local runway snapshots", () => {
  const airport = getAirport({airport: "EGPH"});
  const map: ScopeMapData = {airport: airport.icao, airports: [
    {id: "1", identifier: "TEST", name: "Nearby", point: {x: 4, y: 5}, isTowered: true, elevationFeet: 400},
    {id: "2", identifier: "NONE", name: "No elevation", point: {x: 4, y: 6}, isTowered: false},
  ], approaches: [
    {airportIcao: "TEST", runway: "09", threshold: {x: 4, y: 5}, departure: {x: 5, y: 5}, ils: false},
    {airportIcao: "NONE", runway: "09", threshold: {x: 4, y: 6}, departure: {x: 5, y: 6}, ils: false},
    {airportIcao: "TEST", runway: "27", threshold: {x: 4, y: 5}, departure: {x: 4, y: 5}, ils: false},
  ]};
  const result = departureAirports(airport, map);
  assert.deepEqual(result.map(entry => entry.icao), ["EGPH", "TEST"]);
  assert.ok(result[0].runways.length);
  assert.equal(result[1].elevation, 400);
  assert.deepEqual(result[1].runways.map(end => end.id), ["09"]);
  map.approaches![0].threshold.x = 100;
  assert.equal(result[1].runways[0].threshold.x, 4);
  assert.equal(departureAirports(airport, {...map, airport: "EGLL"}).length, 1);
});


test("map shortcut chooses the nearest usable airport within the screen hit radius", () => {
  const origins = departureAirports(getAirport({airport: "EGPH"}));
  const candidates = [{identifier: "EGPH", point: {x: 0, y: 0}}, {identifier: "TEST", point: {x: 2, y: 0}}];
  const project = (point: {x: number; y: number}) => ({x: point.x * 20, y: point.y * 20});
  assert.equal(nearestDepartureAirport(candidates, origins, {x: .2, y: 0}, project), "EGPH");
  assert.equal(nearestDepartureAirport(candidates, origins, {x: 4, y: 0}, project), undefined);
});


test("three-character departure identifiers are offered only with usable runway data", () => {
  const airport = getAirport({airport: "EGPH"});
  const map: ScopeMapData = {airport: airport.icao, airports: [
    {id: "1", identifier: "ABC", name: "Three character", point: {x: 4, y: 5}, isTowered: false, elevationFeet: 400},
    {id: "2", identifier: "AB", name: "Too short", point: {x: 4, y: 6}, isTowered: false, elevationFeet: 400},
    {id: "3", identifier: "XYZ", name: "No runway", point: {x: 4, y: 7}, isTowered: false, elevationFeet: 400},
  ], approaches: [
    {airportIcao: "ABC", runway: "09", threshold: {x: 4, y: 5}, departure: {x: 5, y: 5}, ils: false},
    {airportIcao: "AB", runway: "09", threshold: {x: 4, y: 6}, departure: {x: 5, y: 6}, ils: false},
  ]};
  const origins = departureAirports(airport, map);
  assert.deepEqual(origins.map(item => item.icao), ["EGPH", "ABC"]);
  assert.deepEqual(origins[1].runways.map(end => end.id), ["09"]);
  assert.equal(nearestDepartureAirport(map.airports, origins, {x: 4, y: 5}, point => point), "ABC");
});


test("scenario conversion selects the closest airport and the closest runway aligned with heading", () => {
  const airport = getAirport({airport: "EGPH"});
  const map: ScopeMapData = {airport: airport.icao, airports: [
    {id: "1", identifier: "TEST", point: {x: 10, y: 10}, isTowered: false, elevationFeet: 400},
    {id: "2", identifier: "FAR", point: {x: 30, y: 30}, isTowered: false, elevationFeet: 400},
  ]};
  const origins = [{icao: "TEST", name: "Nearby", elevation: 400, runways: [
    {id: "09L", threshold: {x: 9, y: 10}, departure: {x: 11, y: 10}},
    {id: "09R", threshold: {x: 9, y: 11}, departure: {x: 11, y: 11.02}},
    {id: "27R", threshold: {x: 11, y: 10}, departure: {x: 9, y: 10}},
  ]}, {icao: "FAR", name: "Far", elevation: 400, runways: [{id: "09", threshold: {x: 30, y: 30}, departure: {x: 31, y: 30}}]}];
  assert.deepEqual(nearestScenarioDeparture(origins, map, airport, {x: 10, y: 11.2}, 90), {origin: origins[0], runway: "09R"});
  assert.equal(nearestScenarioDeparture(origins, map, airport, {x: 10, y: 11.2}, 270).runway, "27R");
  assert.equal(nearestScenarioDeparture(origins, map, airport, {x: 29, y: 30}, 90).origin.icao, "FAR");
});
