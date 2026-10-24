import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {initialExercise} from "./engine";
import {EXERCISE_WEATHER} from "./model";
import {MemoryStore} from "./session-test-store";
import {SessionService} from "./server/session-service";
import {applySessionWeather, requestSessionWeather} from "./server/session-weather";
import {fetchWeatherReport, type WeatherReport} from "./server/weather-provider";

const report = (text = "Edinburgh information Alpha. Test broadcast."): WeatherReport => ({airport: "EGPH", fetchedAt: "2026-10-24T00:00:00Z", warnings: [], weather: {...EXERCISE_WEATHER, windSpeed: 12, rawMetar: "EGPH TEST METAR", observedAt: "2026-10-24T00:00:00Z"}, atis: [{airport: "EGPH", type: "combined", code: "A", datis: text, updatedAt: "2026-10-24T00:00:00Z"}]});

test("session creation and reset load weather without importing public ATIS", async () => {
  const store = new MemoryStore(), calls: unknown[] = [];
  let observation = report();
  const service = new SessionService(store, () => 1000, randomUUID, undefined, undefined, async (airport, fresh, weatherOnly) => {calls.push([airport, fresh, weatherOnly]); return observation;});
  const actor = {accountId: "weather-trainer", staff: true}, token = randomUUID();
  const created = await service.create(actor, "Weather check");
  assert.match(store.records.get(created.id)!.exercise.publishedAtis, /EGPH TEST METAR/);
  assert.equal(store.records.get(created.id)!.exercise.atis.publicText, undefined);
  assert.equal(store.records.get(created.id)!.exercise.weather!.windSpeed, 12);
  await service.join(actor, created.id, "staff", token);
  observation = report("Edinburgh information Bravo. Fresh after reset.");
  const envelope = {id: randomUUID(), time: 1000, action: {kind: "reset" as const}};
  await service.dispatch(actor, created.id, "staff", token, envelope);
  assert.match(store.records.get(created.id)!.exercise.publishedAtis, /EGPH TEST METAR/);
  assert.ok(!store.records.get(created.id)!.exercise.publishedAtis.includes("Fresh after reset"));
  assert.deepEqual(calls, [["EGPH", true, true], ["EGPH", true, true]]);
  const revision = store.records.get(created.id)!.exercise.revision;
  await service.dispatch(actor, created.id, "staff", token, envelope);
  assert.equal(store.records.get(created.id)!.exercise.revision, revision, "retrying a reset cannot apply another observation");
});

test("weather updates preserve controller ATIS choices and exclude external broadcasts", () => {
  const state = initialExercise(), source = report("External broadcast must not appear");
  state.atis.letter = "CHARLIE"; state.atis.remarks = ["NO PATTERN WORK"];
  state.atis.publicText = "Previously imported full ATIS"; state.atis.publicSource = "https://atis.info/api/EGPH";
  source.weather = {...source.weather!, windDirection: 240, windSpeed: 14, temperature: 18, dewpoint: 9, visibilityKm: 7};
  const updated = applySessionWeather(state, source);
  assert.deepEqual(updated.weather, source.weather); assert.deepEqual(updated.atis.weather, source.weather);
  assert.equal(updated.atis.letter, "CHARLIE"); assert.deepEqual(updated.atis.remarks, state.atis.remarks);
  assert.deepEqual(updated.atis.departures, state.atis.departures); assert.deepEqual(updated.atis.arrivals, state.atis.arrivals);
  assert.equal(updated.atis.publicText, undefined); assert.equal(updated.atis.publicSource, undefined);
  assert.ok(!updated.publishedAtis.includes("External broadcast"));
  assert.equal(applySessionWeather(state, {...source, weather: undefined}), state);
});

test("METAR-only airports publish generated ATIS, and an unavailable source preserves the exercise", async () => {
  const state = initialExercise(), source = report(); source.atis = [];
  const updated = applySessionWeather(state, source);
  assert.match(updated.publishedAtis, /EGPH TEST METAR/);
  assert.equal(updated.atis.publicText, undefined);
  assert.deepEqual(updated.publishedDraft, updated.atis);
  assert.equal(await requestSessionWeather("EGPH", async () => {throw new Error("Offline");}), undefined);
  assert.equal(applySessionWeather(state, undefined), state);
  assert.equal(applySessionWeather(state, {...source, airport: "KJFK"}), state);
  assert.equal(applySessionWeather(state, {...source, weather: undefined}), state);
});

test("automatic weather requests bypass a cached report while ordinary reads reuse it", async () => {
  const original = globalThis.fetch; let requests = 0;
  globalThis.fetch = (async input => {requests++; return Response.json(String(input).includes('aviationweather.gov') ? [{icaoId: "LFPG", obsTime: Date.now() / 1000, rawOb: "LFPG TEST", wdir: 270, wspd: 10, visib: 10, altim: 1015, temp: 10, dewp: 5}] : []);}) as typeof fetch;
  try {
    await fetchWeatherReport("LFPG", true); assert.equal(requests, 2);
    await fetchWeatherReport("LFPG"); assert.equal(requests, 2);
    await fetchWeatherReport("LFPG", true); assert.equal(requests, 4);
  } finally {globalThis.fetch = original;}
});

test("automatic weather requests fetch METAR only and do not reuse a full ATIS cache", async () => {
  const original = globalThis.fetch, urls: string[] = [];
  globalThis.fetch = (async input => {const url = String(input); urls.push(url); return Response.json(url.includes('aviationweather.gov') ? [{icaoId: "EHAM", obsTime: Date.now() / 1000, rawOb: "EHAM TEST", wdir: 250, wspd: 15, visib: 6, altim: 1009, temp: 12, dewp: 5}] : [{airport: "EHAM", type: "combined", code: "B", datis: "FULL BROADCAST", updatedAt: "2026-10-24T00:00:00Z"}]);}) as typeof fetch;
  try {
    const automatic = await requestSessionWeather("EHAM", fetchWeatherReport);
    assert.equal(urls.length, 1); assert.ok(urls[0].includes("aviationweather.gov")); assert.deepEqual(automatic!.atis, []);
    assert.equal(automatic!.weather!.temperature, 12); assert.equal(automatic!.weather!.dewpoint, 5);
    await fetchWeatherReport("EHAM"); assert.equal(urls.length, 3);
    await requestSessionWeather("EHAM", fetchWeatherReport); assert.equal(urls.length, 4);
  } finally {globalThis.fetch = original;}
});
