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

test("session creation and reset fetch and publish fresh external ATIS without a mentee action", async () => {
  const store = new MemoryStore(), calls: unknown[] = [];
  let observation = report();
  const service = new SessionService(store, () => 1000, randomUUID, undefined, undefined, async (airport, fresh) => {calls.push([airport, fresh]); return observation;});
  const actor = {accountId: "weather-trainer", staff: true}, token = randomUUID();
  const created = await service.create(actor, "Weather check");
  assert.equal(store.records.get(created.id)!.exercise.publishedAtis, observation.atis[0].datis);
  assert.equal(store.records.get(created.id)!.exercise.weather!.windSpeed, 12);
  await service.join(actor, created.id, "staff", token);
  observation = report("Edinburgh information Bravo. Fresh after reset.");
  const envelope = {id: randomUUID(), time: 1000, action: {kind: "reset" as const}};
  await service.dispatch(actor, created.id, "staff", token, envelope);
  assert.equal(store.records.get(created.id)!.exercise.publishedAtis, observation.atis[0].datis);
  assert.deepEqual(calls, [["EGPH", true], ["EGPH", true]]);
  const revision = store.records.get(created.id)!.exercise.revision;
  await service.dispatch(actor, created.id, "staff", token, envelope);
  assert.equal(store.records.get(created.id)!.exercise.revision, revision, "retrying a reset cannot apply another observation");
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
