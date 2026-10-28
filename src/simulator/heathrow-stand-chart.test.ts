import assert from "node:assert/strict";
import test from "node:test";
import {getAirport, runwayEnds} from "./airports";
import {gatesFor, standPlacement} from "./scenarios";
import {planTaxiRoute} from "./taxi-routing";
import terminalCharts from "./heathrow-t3-t4-chart.json";

// NATS Terminal 5 parking chart, AD 2-EGLL-2-4, effective 20 March 2025.
// Longitude minutes are 29 for the first group and 28 for the second.
const positions: [string, number, number, number][] = [
  ["501", 26.57, 29, 22.32], ["502", 26.10, 29, 20.09], ["503", 26.06, 29, 17.86], ["505", 25.72, 29, 15.27],
  ["506", 26.35, 29, 9.85], ["507", 24.96, 29, 9.84], ["508", 23.35, 29, 10.42], ["509", 21.74, 29, 9.81],
  ["511", 20.35, 29, 9.80], ["512", 18.73, 29, 10.44], ["513", 16.80, 29, 11.03], ["514", 16.55, 29, 11.11],
  ["515", 15.12, 29, 9.87], ["516", 14.15, 29, 11.10], ["517", 13.72, 29, 9.76], ["518", 11.76, 29, 11.08],
  ["519", 9.94, 29, 8.66], ["520", 9.93, 29, 11.33], ["521", 9.92, 29, 13.76], ["522", 9.91, 29, 16.36],
  ["523", 9.90, 29, 18.95], ["524", 5.14, 29, 19.74], ["525", 5.15, 29, 17.52], ["526", 5.17, 29, 12.50],
  ["527", 5.51, 29, 10.32], ["531", 25.71, 28, 54.69], ["532", 23.31, 28, 54.81], ["533", 20.92, 28, 54.81],
  ["534", 18.53, 28, 54.79], ["535", 16.13, 28, 54.75], ["536", 13.74, 28, 54.73], ["537", 11.34, 28, 54.71],
  ["538", 8.95, 28, 54.69], ["539", 6.55, 28, 54.51], ["541", 6.46, 28, 50.34], ["542", 8.86, 28, 50.33],
  ["543", 11.25, 28, 50.38], ["544", 13.89, 28, 50.40], ["544L", 13.28, 28, 48.88], ["544R", 14.55, 28, 50.19], ["545", 16.77, 28, 50.43],
  ["545L", 16.15, 28, 48.92], ["545R", 17.45, 28, 50.35], ["546", 19.65, 28, 50.45], ["546R", 20.35, 28, 50.37],
  ["547", 23.08, 28, 50.64], ["547L", 22.46, 28, 48.96], ["547R", 23.83, 28, 49.76], ["548", 26.29, 28, 50.23],
  ["548L", 25.64, 28, 48.71], ["548R", 26.98, 28, 49.87], ["551", 6.62, 28, 36.43], ["552", 9.01, 28, 36.45],
  ["553", 11.41, 28, 36.47], ["554", 13.80, 28, 36.50], ["555", 16.44, 28, 36.33], ["556", 19.93, 28, 36.36],
  ["557", 23.36, 28, 36.39], ["558", 26.24, 28, 36.42], ["561", 26.28, 28, 31.81], ["562", 23.40, 28, 31.77],
  ["563", 20.04, 28, 31.75], ["564", 17.16, 28, 31.73], ["565", 13.96, 28, 31.70], ["566", 11.32, 28, 31.44], ["567", 8.93, 28, 31.42],
  ["568", 6.53, 28, 31.40], ["572", 21.87, 28, 17.89], ["573", 19.47, 28, 17.87], ["575", 13.67, 28, 17.60], ["576", 9.79, 28, 17.58],
  ["581", 6.67, 28, 19.09], ["582", 7.16, 28, 15.60], ["583", 7.18, 28, 11.69], ["590", 9.05, 28, 13.45], ["591", 11.47, 28, 13.47],
  ["592", 13.90, 28, 13.49], ["594", 19.57, 28, 14.01], ["595", 22.45, 28, 14.27], ["596", 25.33, 28, 14.56],
];

test("Heathrow Terminal 5 stand endpoints are close to the published chart positions", () => {
  const airport = getAirport({airport: "EGLL"}), gates = gatesFor(airport);
  assert.equal(positions.length, 80);
  for (const [name, latitudeSeconds, longitudeMinutes, longitudeSeconds] of positions) {
    const matches = gates.filter(gate => gate.name === name);
    assert.equal(matches.length, 1, name);
    const lat = 51 + 28 / 60 + latitudeSeconds / 3600, lon = -(longitudeMinutes / 60 + longitudeSeconds / 3600);
    const chart = {x: (lon - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (lat - airport.origin.lat) * 60};
    const position = standPlacement(matches[0].id, false, airport)!.position;
    assert.ok(Math.hypot(position.x - chart.x, position.y - chart.y) * 1852 < 15, name);
  }
});

test("Heathrow Terminal 4 uses charted parking ends and preserves earlier snapshots", () => {
  const airport = getAirport({airport: "EGLL"});
  const previous = getAirport({airport: "EGLL", airportDataVersion: "d7ede30f598ef663f1b07361cc52010ca0f3fbc35de401f4be4bc74f9dd6e565"});
  const entries: [string, number, number, number][] = [
    ["407", 34.09, 26, 57.04], ["423", 37.90, 26, 31.03], ["425", 42.24, 26, 27.97], ["453", 35.47, 27, 18.26],
    ["457", 44.92, 27, 25.11], ["457L", 43.67, 27, 23.40], ["457R", 44.90, 27, 24.67], ["458", 45.69, 27, 23.92],
  ];
  const gates = gatesFor(airport);
  for (const [name, seconds, minutesWest, secondsWest] of entries) {
    const matches = gates.filter(gate => gate.name === name);
    assert.equal(matches.length, 1, name);
    const lat = 51 + 27 / 60 + seconds / 3600, lon = -(minutesWest / 60 + secondsWest / 3600);
    const chart = {x: (lon - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (lat - airport.origin.lat) * 60};
    const position = standPlacement(matches[0].id, false, airport)!.position;
    assert.ok(Math.hypot(position.x - chart.x, position.y - chart.y) * 1852 < 10, name);
    assert.deepEqual(position, previous.features.find(feature => feature.id === matches[0].id)!.points[0]);
    for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position, end.id).path, `${name} to ${end.id}`);
  }
  assert.ok(previous.features.filter(feature => feature.kind === "parking_position" && feature.name === "423").length > 1);
  assert.ok(previous.features.filter(feature => feature.kind === "parking_position" && feature.name === "425").length > 1);
  for (const [name, seconds, minutesWest, secondsWest] of [["409", 37.98, 26, 51.87], ["424", 40.03, 26, 29.44], ["429", 45.02, 26, 29.06], ["440", 39.37, 27, 7.48], ["441", 41.19, 27, 4.87]] as const) {
    const matches = gates.filter(gate => gate.name === name);
    assert.equal(matches.length, 1, name);
    assert.equal(previous.features.filter(feature => feature.kind === "parking_position" && feature.name === name).length, 2, name);
    const lat = 51 + 27 / 60 + seconds / 3600, lon = -(minutesWest / 60 + secondsWest / 3600);
    const chart = {x: (lon - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (lat - airport.origin.lat) * 60};
    const position = standPlacement(matches[0].id, false, airport)!.position;
    assert.ok(Math.hypot(position.x - chart.x, position.y - chart.y) * 1852 < 10, name);
  }
});

test("Heathrow stand 422 uses its chart-matched mapped line", () => {
  const airport = getAirport({airport: "EGLL"});
  const previous = getAirport({airport: "EGLL", airportDataVersion: "cfcb952b63348d1fc62d4f9c76ab9bf702e88bfa52c9a76be19626366656e831"});
  const stand = gatesFor(airport).find(gate => gate.name === "422")!;
  assert.equal(stand.id, "405711679");
  const old = previous.features.find(feature => feature.id === stand.id)!;
  assert.equal(old.kind, "taxilane");
  assert.deepEqual(stand.points, old.points);
  const lat = 51 + 27 / 60 + 35.74 / 3600, lon = -(26 / 60 + 32.54 / 3600);
  const chart = {x: (lon - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (lat - airport.origin.lat) * 60};
  const position = standPlacement(stand.id, false, airport)!.position;
  assert.ok(Math.hypot(position.x - chart.x, position.y - chart.y) * 1852 < 12);
  for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position, end.id).path, end.id);
});

test("Heathrow stand 430 has one selectable position and retains both mapped approaches", () => {
  const airport = getAirport({airport: "EGLL"});
  const previous = getAirport({airport: "EGLL", airportDataVersion: "cfcb952b63348d1fc62d4f9c76ab9bf702e88bfa52c9a76be19626366656e831"});
  const gate = gatesFor(airport).filter(item => item.name === "430");
  assert.equal(gate.length, 1);
  assert.equal(gate[0].id, "1303452492");
  const other = airport.features.find(feature => feature.id === "1303452491")!;
  const old = previous.features.find(feature => feature.id === other.id)!;
  assert.equal(other.kind, "taxilane");
  assert.deepEqual(other.points, old.points);
  assert.deepEqual(other.points.at(-1), gate[0].points.at(-1));
  const lat = 51 + 27 / 60 + 39.43 / 3600, lon = -(26 / 60 + 24.30 / 3600);
  const chart = {x: (lon - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (lat - airport.origin.lat) * 60};
  const position = standPlacement(gate[0].id, false, airport)!.position;
  assert.ok(Math.hypot(position.x - chart.x, position.y - chart.y) * 1852 < 3);
  for (const end of runwayEnds(airport)) assert.ok(planTaxiRoute(airport, position, end.id).path, end.id);
});

test("Heathrow Terminal 3 and 4 stands are selectable near their chart coordinates", () => {
  const airport = getAirport({airport: "EGLL"}), gates = gatesFor(airport);
  assert.equal(terminalCharts.coordinates.length, 101);
  for (const [name, latitude, longitude] of terminalCharts.coordinates) {
    const matches = gates.filter(gate => gate.name === name);
    assert.equal(matches.length, 1, name);
    const lat = 51 + Number(latitude.slice(2, 4)) / 60 + Number(latitude.slice(4)) / 3600;
    const lon = -(Number(longitude.slice(3, 5)) / 60 + Number(longitude.slice(5)) / 3600);
    const chart = {x: (lon - airport.origin.lon) * 60 * Math.cos(airport.origin.lat * Math.PI / 180), y: (lat - airport.origin.lat) * 60};
    const position = standPlacement(matches[0].id, false, airport)!.position;
    assert.ok(Math.hypot(position.x - chart.x, position.y - chart.y) * 1852 < 21, name);
  }
});
