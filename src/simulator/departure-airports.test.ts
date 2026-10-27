import assert from "node:assert/strict";
import test from "node:test";
import {getAirport} from "./airports";
import {departureAirports, nearestDepartureAirport} from "./departure-airports";
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
