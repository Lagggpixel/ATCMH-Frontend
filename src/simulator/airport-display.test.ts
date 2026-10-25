import assert from "node:assert/strict";
import test from "node:test";
import {canLoadAirportProcedures, hitAirports, visibleProcedures, procedureKey, procedureColor, procedureRunwaySummary, runwayWindComponents, weatherCategory, type AirportInformation, type AirportProcedures, type AirportWeather, type ScopeAirport} from "./airport-display";
import {createAirportDisplayApi, fetchAirportInformation, fetchAirportProcedures, fetchAirportWeather} from "./server/airport-display-api";
import {EXERCISE_WEATHER} from "./model";
import {getAirport} from "./airports";
import {SessionError} from "./sessions";

const info: AirportInformation = {airport: "EGPH", name: "Edinburgh", runways: [], frequencies: [], warnings: []};
const weather: AirportWeather = {airport: "EGPH", fetchedAt: "2026-10-24T12:00:00Z", atis: [], warnings: []};
const procedures: AirportProcedures = {airport: "EGPH", origin: "EGPH", revision: "a", procedures: [
  {id: "1", airport: "EGPH", name: "TEST1", type: "SID", routes: [{id: "1", name: "Common", points: [{x: 0, y: 0}, {x: 1, y: 1}]}]},
  {id: "2", airport: "EGPH", name: "TEST2", type: "STAR", routes: []},
]};
const req = (query = "airport=EGPH&layer=info") => new Request(`https://trainer.test/api/simulator/airport-display?${query}`);
const learner = async () => ({accountId: "learner", staff: false, learnerSession: "session"});

test("airport hit testing follows map projection, distance and the three-airport cap", () => {
  const airports: ScopeAirport[] = [40, 8, 1, 20, 2].map((x, i) => ({identifier: `APT${i}`, name: null, isTowered: true, point: {x, y: 0}}));
  assert.deepEqual(hitAirports(airports, {x: 10, y: 10}, p => ({x: p.x + 10, y: p.y + 10})).map(p => p.identifier), ["APT2", "APT4", "APT1"]);
  assert.equal(airports[0].point.x, 40);
  assert.deepEqual(hitAirports(airports, {x: 100, y: 100}, p => p), []);
});
test("procedure preview disappears when closed while checked procedures from every airport survive", () => {
  const other = {...procedures.procedures[0], airport: "EGLL"};
  assert.deepEqual(visibleProcedures([], procedures), procedures.procedures);
  assert.deepEqual(visibleProcedures([]), []);
  assert.deepEqual(visibleProcedures([other], procedures), [other, ...procedures.procedures]);
  assert.deepEqual(visibleProcedures([other, procedures.procedures[0]], procedures), [other, procedures.procedures[0]]);
  assert.notEqual(procedureKey(other), procedureKey(procedures.procedures[0]));
});
test("IF procedure rows summarize runway transitions and use the same indexed pastel as the overlay", () => {
  const procedure = procedures.procedures[0];
  const rows = (names: string[]) => ({routes: names.map(name => ({id: name, name, points: []}))});
  assert.equal(procedureRunwaySummary(rows(["TLA", "Common route"])), "All Rwys");
  assert.equal(procedureRunwaySummary(rows(["RW06", "RW24", "RW06", "TLA"])), "06,24");
  assert.equal(procedureRunwaySummary(rows(["RW06L", "RW06R", "RW24L", "RW24R"])), "4 Rwys");
  assert.equal(procedureColor({...procedure, index: 0}), "#ff9aa2");
  assert.equal(procedureColor({...procedure, index: 1}), "#ffb7b2");
  assert.equal(procedureColor({...procedure, index: 6}), procedureColor({...procedure, index: 0}));
});
test("runway inspection uses true wind geometry and weather badges require known ceilings", () => {
  assert.deepEqual(runwayWindComponents(90, {...EXERCISE_WEATHER, windDirection: 90, windSpeed: 20}), {headwind: 20, crosswind: 0});
  assert.equal(runwayWindComponents(90, {...EXERCISE_WEATHER, windDirection: 270, windSpeed: 20}).headwind, -20);
  assert.equal(weatherCategory({...EXERCISE_WEATHER, rawMetar: "EGPH 241200Z 24010KT 9999 BKN004"}), "LIFR");
  assert.equal(weatherCategory({...EXERCISE_WEATHER, rawMetar: "EGPH 241200Z 24010KT 9999 OVC008"}), "IFR");
  assert.equal(weatherCategory({...EXERCISE_WEATHER, rawMetar: "EGPH 241200Z 24010KT 9999 BKN020"}), "MVFR");
  assert.equal(weatherCategory({...EXERCISE_WEATHER, visibilityKm: 10, rawMetar: "EGPH 241200Z 24010KT CAVOK"}), "VFR");
  assert.equal(weatherCategory(EXERCISE_WEATHER), undefined);
});
test("airport reads authorize learners before fetching; invalid requests never reach providers", async () => {
  let reads = 0; const permissions: boolean[] = [];
  const load = async () => {reads++; return info;};
  const api = createAirportDisplayApi(load, async () => weather, async () => procedures, async (_request, staff) => {permissions.push(staff); return learner();});
  const denied = createAirportDisplayApi(load, async () => weather, async () => procedures, async () => {throw new SessionError("forbidden", "No access", 403);});
  assert.equal((await denied(req())).status, 403); assert.equal(reads, 0);
  assert.equal((await api(req("airport=../private&layer=info"))).status, 400);
  assert.equal((await api(req("airport=EGPH&layer=bad"))).status, 400);
  assert.equal((await api(req("airport=EGPH&layer=procedures&origin=NOPE"))).status, 400); assert.equal(reads, 0);
  assert.deepEqual(await (await api(req())).json(), info);
  assert.equal((await api(req())).headers.get("cache-control"), "private, no-store"); assert.equal(reads, 1);
  await api(req("airport=EGPH&layer=info&refresh=1")); assert.equal(reads, 2);
  assert.ok(permissions.every(value => value === false));
});
test("airport provider errors are sanitized, evicted and retryable", async () => {
  let reads = 0;
  const api = createAirportDisplayApi(async () => {if (++reads === 1) throw new Error("private-key"); return info;}, async () => weather, async () => procedures, learner);
  const failed = await api(req()); assert.equal(failed.status, 503); assert.doesNotMatch(await failed.text(), /private-key/);
  assert.equal((await api(req())).status, 200); assert.equal(reads, 2);
  assert.deepEqual(await (await api(req("airport=EGPH&layer=weather"))).json(), weather);
});
test("nearby procedures are rejected before provider reads while nearby information and weather remain available", async () => {
  let procedureReads = 0;
  const api = createAirportDisplayApi(async code => ({...info, airport: code}), async code => ({...weather, airport: code}), async () => {procedureReads++; return procedures;}, learner);
  assert.equal(canLoadAirportProcedures("EGPH", "EGPH"), true);
  assert.equal(canLoadAirportProcedures("EGPK", "EGPH"), false);
  assert.equal(canLoadAirportProcedures(undefined, undefined), false);
  for (const refresh of ["", "&refresh=1"]) {
    assert.equal((await api(req(`airport=EGPK&origin=EGPH&layer=procedures${refresh}`))).status, 400);
  }
  assert.equal(procedureReads, 0);
  await assert.rejects(fetchAirportProcedures("EGPK", "EGPH"), {code: "invalid-airport"});
  assert.equal((await api(req("airport=EGPK&origin=EGPH&layer=info"))).status, 200);
  assert.equal((await api(req("airport=EGPK&origin=EGPH&layer=weather"))).status, 200);
  assert.deepEqual(await (await api(req("airport=EGPH&origin=EGPH&layer=procedures"))).json(), procedures);
  assert.equal(procedureReads, 1);
});
test("controlled-airport geometry retains separate transitions and complete routes", async () => {
  const originalFetch = globalThis.fetch, base = process.env.INFINITE_HORIZON_API_URL, key = process.env.INFINITE_HORIZON_API_KEY;
  process.env.INFINITE_HORIZON_API_URL = "https://nav.test"; process.env.INFINITE_HORIZON_API_KEY = "synthetic";
  const origin = getAirport().origin;
  globalThis.fetch = async () => Response.json({version: 1, icao: "EGPH", revision: "fixture", waypoints: [], procedures: [{id: "sid", identifier: "TEST1", type: "SID", routes: [
    {id: "a", transition: "06", points: Array.from({length: 201}, (_, i) => ({identifier: `A${i}`, lat: origin.lat + 1 / 60, lon: origin.lon}))},
    {id: "b", transition: "24", points: [{identifier: "B", lat: origin.lat + 2 / 60, lon: origin.lon + 1 / 60}]},
  ]}]});
  try {
    const value = await fetchAirportProcedures("EGPH", "EGPH");
    assert.equal(value.origin, "EGPH"); assert.equal(value.procedures[0].routes.length, 2);
    assert.equal(value.procedures[0].routes[0].points.length, 201);
    assert.ok(Math.abs(value.procedures[0].routes[0].points[0].y - 1) < 1e-8);
    assert.equal(value.procedures[0].routes[1].points[0].name, "B");
    assert.doesNotMatch(JSON.stringify(value), /synthetic|cleared|expected|flightPlan/);
  } finally {globalThis.fetch = originalFetch; if (base === undefined) delete process.env.INFINITE_HORIZON_API_URL; else process.env.INFINITE_HORIZON_API_URL = base; if (key === undefined) delete process.env.INFINITE_HORIZON_API_KEY; else process.env.INFINITE_HORIZON_API_KEY = key;}
});
test("reference adapter validates airport identity, converts units and preserves unavailable metadata", async () => {
  const originalFetch = globalThis.fetch, base = process.env.INFINITE_HORIZON_API_URL, key = process.env.INFINITE_HORIZON_API_KEY;
  process.env.INFINITE_HORIZON_API_URL = "https://nav.test"; process.env.INFINITE_HORIZON_API_KEY = "synthetic";
  globalThis.fetch = async input => Response.json(String(input).includes("map-overlay") ? {icao: "EGPH", center: {lat: 56, lon: -3}, airports: [{identifier: "EGPH", name: "Edinburgh", lat: 56, lon: -3, altitudeM: 40, isTowered: true}]} : {icao: "EGPH", runways: [{widthM: 45, start: {designator: "06", lat: 56, lon: -3, headingDegrees: 60, ils: {glideSlopeDegrees: 3}}, end: {designator: "24", lat: 56.01, lon: -2.98, headingDegrees: 240, ils: null}}]});
  try {
    const value = await fetchAirportInformation("EGPH");
    assert.equal(value.elevationFeet, 40 * 3.28084); assert.equal(value.runways.length, 2);
    assert.equal(value.runways[0].widthFeet, 45 * 3.28084); assert.equal(value.runways[0].ils?.glideAngle, 3);
    assert.equal(value.runways[0].surface, undefined); assert.equal(value.runways[0].ils?.mhz, undefined);
    globalThis.fetch = async () => Response.json({icao: "WRNG", runways: [], airports: [], center: {lat: 0, lon: 0}});
    const fallback = await fetchAirportInformation("EGPH"); assert.equal(fallback.name, getAirport().name);
    assert.ok(fallback.runways.length > 0); assert.ok(fallback.warnings.length > 0);
  } finally {globalThis.fetch = originalFetch; if (base === undefined) delete process.env.INFINITE_HORIZON_API_URL; else process.env.INFINITE_HORIZON_API_URL = base; if (key === undefined) delete process.env.INFINITE_HORIZON_API_KEY; else process.env.INFINITE_HORIZON_API_KEY = key;}
});
test("public METAR, TAF and D-ATIS are inspection data and missing forecasts remain unavailable", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => String(input).includes("/taf?") ? Response.json([{icaoId: "KSAN", rawTAF: "TAF KSAN 241130Z 2412/2512 28010KT P6SM SKC"}]) : new Response(null, {status: 204});
  try {
    const value = await fetchAirportWeather("KSAN"); assert.match(value.taf!, /^TAF KSAN/); assert.equal(value.weather, undefined); assert.deepEqual(value.atis, []);
    assert.equal((value as unknown as Record<string, unknown>).publishedAtis, undefined);
    globalThis.fetch = async () => new Response(null, {status: 204});
    assert.equal((await fetchAirportWeather("KONT")).taf, undefined);
  } finally {globalThis.fetch = originalFetch;}
});
