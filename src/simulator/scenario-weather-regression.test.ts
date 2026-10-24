import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {airportList, getAirport} from "./airports";
import {engineFor} from "./engine";
import {flightVelocity} from "./aircraft-performance";
import {EXERCISE_WEATHER, type Exercise, type ExerciseWeather} from "./model";
import {exerciseSchema} from "./protocol";
import {radarFlightLabel} from "./radar";
import {advanceScenario, executeScenarioEvent} from "./scenario-engine";
import {createScenarioExercise, scenarioFromExercise, scenarioRuntimeSchema} from "./scenarios";
import {MemoryStore} from "./session-test-store";
import {SessionService} from "./server/session-service";
import {applySessionWeather} from "./server/session-weather";
import type {WeatherReport} from "./server/weather-provider";

const liveWeather: ExerciseWeather = {windDirection: 50, windSpeed: 10, visibilityKm: 16, qnh: 1024.1, temperature: 24.4, reference: "Session METAR"};
const changedWeather: ExerciseWeather = {...liveWeather, windDirection: 270, windSpeed: 30, qnh: 980, temperature: 5, reference: "Updated session weather"};
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);

function scenario(airport: string, mode: "local" | "approach" | "center", authoredWeather?: ExerciseWeather) {
  const engine = engineFor({airport, trainingStation: `${airport}:${mode}`}), exercise = engine.initialExercise();
  const a = engine.newAircraft("weather-aircraft", true);
  Object.assign(a, {position: {x: 50, y: 50}, heading: 90, targetHeading: 90, altitude: 10000,
    type: "A320", performanceProfile: "A320", speed: 250, targetSpeed: 250, speedMode: "manual", mode: "heading", flightPlan: []});
  if (mode !== "local") {a.radar = {station: mode, navigation: "heading", routeIndex: 0}; a.frequency = mode;}
  exercise.aircraft = [a];
  const definition = scenarioFromExercise(exercise, "Weather mismatch regression");
  if (authoredWeather) definition.weather = {...authoredWeather}; else delete definition.weather;
  return createScenarioExercise(definition, randomUUID(), randomUUID());
}

function observation(airport: string, weather = liveWeather): WeatherReport {
  return {airport, weather, fetchedAt: "2026-10-24T16:53:00Z", warnings: [], atis: []};
}

function checkMotion(before: Exercise, after: Exercise, seconds: number) {
  const a = before.aircraft[0], actual = after.aircraft[0], velocity = flightVelocity(a, before.weather ?? EXERCISE_WEATHER);
  near(actual.speed, a.speed);
  near(actual.groundSpeed!, Math.hypot(velocity.x, velocity.y));
  near(actual.position.x - a.position.x, velocity.x * seconds / 3600);
  near(actual.position.y - a.position.y, velocity.y * seconds / 3600);
  // Scope predicts from the session snapshot, including its weather and pinned map.
  const scopeEngine = engineFor({airport: before.airport, airportDataVersion: before.airportDataVersion,
    radarEnvironment: before.radarEnvironment, weather: before.weather, traffic: before.aircraft});
  const predicted = scopeEngine.predictAircraft(before.aircraft, seconds, before.autoReadback)[0];
  near(actual.groundSpeed!, predicted.groundSpeed!);
  const airport = getAirport(before);
  assert.equal(radarFlightLabel(actual, airport, before.radarEnvironment).flight,
    radarFlightLabel(predicted, airport, before.radarEnvironment).flight);
}

for (const airport of airportList) test(`${airport.icao}: scenario frames and tag prediction use session weather when the template has none`, () => {
  const {exercise, runtime} = scenario(airport.icao, "local"), original = structuredClone(runtime.definition);
  let state: Exercise = {...applySessionWeather(exercise, observation(airport.icao)), running: true, autoReadback: false};
  for (let frame = 0; frame < 10; frame++) {
    const next = advanceScenario(state, runtime, .2, frame * 200).exercise;
    checkMotion(state, next, .2); state = next;
  }
  assert.deepEqual(runtime.definition, original, "live weather must not rewrite the published template");
});

for (const mode of ["approach", "center"] as const) test(`${mode}: live PHOG weather overrides conflicting authored weather for motion and tags`, () => {
  const {exercise, runtime} = scenario("PHOG", mode, EXERCISE_WEATHER), original = structuredClone(runtime.definition);
  const before = {...applySessionWeather(exercise, observation("PHOG")), running: true, autoReadback: false};
  checkMotion(before, advanceScenario(before, runtime, .2, 200).exercise, .2);
  assert.deepEqual(runtime.definition, original);
});

for (const authored of [undefined, changedWeather]) test(`scenario weather fallback preserves ${authored ? "authored conditions" : "fixed defaults"} when no METAR is available`, () => {
  const {exercise, runtime} = scenario("KDAL", "local", authored);
  const before = {...applySessionWeather(exercise, undefined), running: true, autoReadback: false};
  checkMotion(before, advanceScenario(before, runtime, .2, 200).exercise, .2);
  assert.deepEqual(before.weather, authored);
  assert.deepEqual(runtime.definition.weather, authored);
});

for (const mode of ["local", "approach", "center"] as const) test(`${mode}: restored attempts immediately follow weather edits without changing IAS or the template`, () => {
  let {exercise, runtime} = scenario("KDAL", mode, EXERCISE_WEATHER);
  exercise = {...applySessionWeather(exercise, observation("KDAL")), running: true, autoReadback: false};
  exercise = advanceScenario(exercise, runtime, .2, 200).exercise;
  exercise = exerciseSchema.parse(JSON.parse(JSON.stringify(exercise)));
  runtime = scenarioRuntimeSchema.parse(JSON.parse(JSON.stringify(runtime)));
  const edited = engineFor(exercise).applyEnvelope(exercise, {id: randomUUID(), time: 200, action: {kind: "weather", weather: changedWeather}});
  assert.equal(edited.error, undefined);
  const next = advanceScenario(edited.state, runtime, .2, 400).exercise;
  checkMotion(edited.state, next, .2);
  assert.ok(Math.abs(next.aircraft[0].groundSpeed! - exercise.aircraft[0].groundSpeed!) > 10);
  assert.deepEqual(runtime.definition.weather, EXERCISE_WEATHER);
});

for (const [airport, mode] of [["KDAL", "local"], ["PHOG", "approach"]] as const) test(`${airport}: session creation applies METAR to scenario movement as well as browser frames`, async () => {
  const created = scenario(airport, mode), original = structuredClone(created.runtime.definition), store = new MemoryStore();
  let now = 1_000_000;
  const service = new SessionService(store, () => now, randomUUID, {apply() {}, request() {}}, {apply() {return false;}, request() {}}, async () => observation(airport));
  const actor = {accountId: "weather-trainer", staff: true, owner: true}, token = randomUUID();
  const session = await service.create(actor, "Live weather scenario", created.exercise, created.runtime);
  await service.join(actor, session.id, "staff", token);
  for (const action of [{kind: "auto-readback", enabled: false}, {kind: "play"}] as const)
    await service.dispatch(actor, session.id, "staff", token, {id: randomUUID(), time: now, action});
  let before = (await service.frame(actor, session.id, "staff", token)).exercise;
  assert.deepEqual(before.weather, liveWeather);
  for (let frame = 0; frame < 5; frame++) {
    now += 200;
    const after = (await service.frame(actor, session.id, "staff", token)).exercise;
    checkMotion(before, after, .2); before = after;
  }
  assert.deepEqual(store.records.get(session.id)!.scenario!.definition, original);
});

test("scenario Mach-speed events use the session pressure and temperature immediately", () => {
  const {exercise, runtime} = scenario("PHOG", "center", EXERCISE_WEATHER), aircraftKey = runtime.definition.aircraft[0].key;
  const command = {type: "radar-speed", mode: "maintain", unit: "mach", relation: "exact", value: .65} as const;
  runtime.definition.events = [{id: "mach", title: "Maintain Mach", trigger: {type: "manual"}, actions: [{type: "maneuver", aircraftKey, instruction: command}]}];
  runtime.events.mach = {status: "waiting"};
  const before = applySessionWeather(exercise, observation("PHOG"));
  const envelope = {id: randomUUID(), time: 200, action: {kind: "maneuver", aircraftId: before.aircraft[0].id, command}} as const;
  const expected = engineFor(before).applyEnvelope(before, envelope), stale = engineFor(runtime.definition).applyEnvelope(before, envelope);
  assert.equal(expected.error, undefined); assert.equal(stale.error, undefined);
  assert.ok(Math.abs(expected.state.aircraft[0].targetSpeed - stale.state.aircraft[0].targetSpeed) > .5, "fixture must expose the weather mismatch");
  const actual = executeScenarioEvent(before, runtime, "mach", 200);
  assert.equal(runtime.events.mach.status, "completed");
  near(actual.aircraft[0].targetSpeed, expected.state.aircraft[0].targetSpeed);
});
