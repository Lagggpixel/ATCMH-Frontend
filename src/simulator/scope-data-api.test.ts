import assert from "node:assert/strict";
import test from "node:test";
import {getAirport} from "./airports";
import {createScopeDataApi, fetchScopeMap, fetchScopeWinds} from "./server/scope-data-api";
import {SessionError} from "./sessions";
import type {ScopeMapData, ScopeWinds} from "./scope-map-data";

const map: ScopeMapData = {airport: "EGPH", airports: []};
const winds: ScopeWinds = {airport: "EGPH", validAt: "2026-10-24T10:00:00Z", source: "https://open-meteo.com/", points: []};
const req = (query = "airport=EGPH&layer=map") => new Request(`https://trainer.test/api/simulator/scope-data?${query}`);
const actor = async () => ({accountId: "learner", staff: false});

test("scope layer requests authorize before fetching and validate the airport and layer", async () => {
  let reads = 0;
  const load = async () => {reads++; return map;};
  const denied = createScopeDataApi(load, async () => winds, async () => {throw new SessionError("forbidden", "No access", 403);});
  assert.equal((await denied(req())).status, 403); assert.equal(reads, 0);
  const api = createScopeDataApi(load, async () => winds, actor);
  assert.equal((await api(req("airport=NOPE&layer=map"))).status, 400);
  assert.equal((await api(req("airport=EGPH&layer=invalid"))).status, 400); assert.equal(reads, 0);
  assert.equal((await api(req())).status, 200); assert.equal(reads, 1);
  assert.equal((await api(req())).headers.get("cache-control"), "private, no-store"); assert.equal(reads, 1);
});
test("failed scope layer loads are retried without leaking source errors or credentials", async () => {
  let reads = 0;
  const api = createScopeDataApi(async () => {if (++reads === 1) throw new Error("private-source-key"); return map;}, async () => winds, actor);
  const failed = await api(req()); assert.equal(failed.status, 503);
  assert.doesNotMatch(await failed.text(), /private-source-key/);
  assert.equal((await api(req())).status, 200); assert.equal(reads, 2);
  assert.deepEqual(await (await api(req("airport=EGPH&layer=winds"))).json(), winds);
});
test("map data projects real towered/uncontrolled airports without exposing upstream coordinates or secrets", async () => {
  const originalFetch = globalThis.fetch, base = process.env.INFINITE_HORIZON_API_URL, key = process.env.INFINITE_HORIZON_API_KEY;
  process.env.INFINITE_HORIZON_API_URL = "https://navigation.test"; process.env.INFINITE_HORIZON_API_KEY = "test-only";
  const origin = getAirport().origin;
  globalThis.fetch = async input => {
    assert.match(String(input), /layers=airports/);
    assert.equal(new URL(String(input)).searchParams.get("includeApproaches"), "1");
    assert.equal(new URL(String(input)).searchParams.get("radiusNm"), "200");
    assert.equal(new URL(String(input)).searchParams.get("airportLimit"), "1000");
    assert.equal(new URL(String(input)).searchParams.get("layers"), "airports,vors");
    return Response.json({icao: "EGPH", airports: [{id: "airport", identifier: "TEST", name: "Test field", lat: origin.lat + 1 / 60, lon: origin.lon, isTowered: false}],
      vors: [{id: "vor", identifier: "TST", name: null, lat: origin.lat, lon: origin.lon, vorType: "VOR", frequencyMhz: 115.5}],
      approaches: [{airportIcao: "TEST", runway: "01", threshold: {lat: origin.lat + 1 / 60, lon: origin.lon}, departure: {lat: origin.lat + 2 / 60, lon: origin.lon}, ils: true},
        {airportIcao: "TEST", runway: "19", threshold: {lat: origin.lat + 2 / 60, lon: origin.lon}, departure: {lat: origin.lat + 1 / 60, lon: origin.lon}, ils: false, localizer: true}]});
  };
  try {
    const result = await fetchScopeMap("EGPH");
    assert.equal(result.navaids?.[0].waypointType, "VOR"); assert.equal(result.navaids?.[0].id, "TST");
    assert.equal(result.airports[0].isTowered, false); assert.ok(Math.abs(result.airports[0].point.y - 1) < 1e-8);
    assert.equal(result.approaches?.length, 2);
    assert.equal(result.approaches?.[0].ils, true); assert.equal(result.approaches?.[1].ils, false);
    assert.equal(result.approaches?.[0].localizer, undefined); assert.equal(result.approaches?.[1].localizer, true);
    assert.ok(Math.abs(result.approaches![0].threshold.y - 1) < 1e-8);
    assert.deepEqual(result.approaches?.[0].threshold, result.approaches?.[1].departure);
    assert.doesNotMatch(JSON.stringify(result), /"lat"|"lon"|test-only/);
  } finally {globalThis.fetch = originalFetch; if (base === undefined) delete process.env.INFINITE_HORIZON_API_URL; else process.env.INFINITE_HORIZON_API_URL = base; if (key === undefined) delete process.env.INFINITE_HORIZON_API_KEY; else process.env.INFINITE_HORIZON_API_KEY = key;}
});
test("expanded airport map accepts more than 150 airports without procedure payloads", async () => {
  const originalFetch = globalThis.fetch, base = process.env.INFINITE_HORIZON_API_URL, key = process.env.INFINITE_HORIZON_API_KEY;
  process.env.INFINITE_HORIZON_API_URL = "https://navigation.test"; process.env.INFINITE_HORIZON_API_KEY = "test-only";
  const origin = getAirport().origin;
  globalThis.fetch = async () => Response.json({icao: "EGPH", airports: Array.from({length: 1000}, (_, i) => ({id: String(i), identifier: `A${i}`, name: null, lat: origin.lat + 150 / 60, lon: origin.lon, isTowered: i % 2 === 0})), approaches: [],
    procedures: [{privateGeometry: "must-not-reach-browser"}]});
  try {
    const value = await fetchScopeMap("EGPH");
    assert.equal(value.airports.length, 1000);
    assert.ok(Math.abs(value.airports[999].point.y - 150) < 1e-8);
    assert.doesNotMatch(JSON.stringify(value), /procedures|privateGeometry|test-only/);
  } finally {globalThis.fetch = originalFetch; if (base === undefined) delete process.env.INFINITE_HORIZON_API_URL; else process.env.INFINITE_HORIZON_API_URL = base; if (key === undefined) delete process.env.INFINITE_HORIZON_API_KEY; else process.env.INFINITE_HORIZON_API_KEY = key;}
});
test("missing nearby approach geometry is unavailable rather than silently empty", async () => {
  const originalFetch = globalThis.fetch, base = process.env.INFINITE_HORIZON_API_URL, key = process.env.INFINITE_HORIZON_API_KEY;
  process.env.INFINITE_HORIZON_API_URL = "https://navigation.test"; process.env.INFINITE_HORIZON_API_KEY = "test-only";
  globalThis.fetch = async () => Response.json({icao: "EGPH", airports: [], vors: []});
  try {
    const api = createScopeDataApi(fetchScopeMap, async () => winds, actor);
    const response = await api(req()); assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /test-only|navigation.test/);
    globalThis.fetch = async () => Response.json({icao: "EGPH", airports: [], vors: [], approaches: []});
    assert.equal((await api(req())).status, 200);
  } finally {globalThis.fetch = originalFetch; if (base === undefined) delete process.env.INFINITE_HORIZON_API_URL; else process.env.INFINITE_HORIZON_API_URL = base; if (key === undefined) delete process.env.INFINITE_HORIZON_API_KEY; else process.env.INFINITE_HORIZON_API_KEY = key;}
});

test("winds use model geopotential heights, knots and a consistent forecast time", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = new URL(String(input)); assert.equal(url.hostname, "api.open-meteo.com"); assert.equal(url.searchParams.get("wind_speed_unit"), "kn");
    const fields = url.searchParams.get("hourly")!.split(",");
    const hourly: Record<string, number[]> = {time: [Math.floor(Date.now() / 1000)]}, units: Record<string, string> = {};
    for (const field of fields) {
      const height = field.startsWith("geopotential_height");
      hourly[field] = [height ? 5500 : field.startsWith("wind_direction") ? 270 : 30];
      units[field] = height ? "m" : field.startsWith("wind_direction") ? "°" : "kn";
    }
    return Response.json(Array.from({length: 9}, () => ({elevation: 100, hourly, hourly_units: units})));
  };
  try {
    const result = await fetchScopeWinds("EGPH"); assert.equal(result.points.length, 9);
    assert.ok(Math.abs(result.points[0].levels[0].altitude - 5500 * 3.28084) < 1e-6);
    assert.equal(result.points[0].levels[0].speed, 30); assert.equal(result.points[0].surface.direction, 270);
  } finally {globalThis.fetch = originalFetch;}
});
