import {getAirport, runwayEnds} from "./airports";
import {magneticToTrue} from "./magnetic-headings";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import test, {type TestContext} from "node:test";
import {airportList} from "./airports";
import {engineFor} from "./engine";
import {envelopeSchema} from "./protocol";
import {createSpawnAircraft} from "./spawn-aircraft";
import {readSpawnPreferences, saveSpawnPreferences} from "./spawn-preferences";

function storage(t: TestContext) {
  const values = new Map<string, string>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {configurable: true, value: {localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  }}});
  t.after(() => {if (previous) Object.defineProperty(globalThis, "window", previous); else Reflect.deleteProperty(globalThis, "window");});
  return values;
}

test("default spawns are unassigned inbound traffic at the clicked position in both radar modes", t => {
  storage(t);
  for (const airport of airportList) for (const mode of ["approach", "center"] as const) {
    const engine = engineFor({airport: airport.icao, trainingStation: `${airport.icao}:${mode}`}), exercise = engine.initialExercise();
    const preferences = readSpawnPreferences("mentor", exercise);
    assert.equal(preferences.airborne, true); assert.equal(preferences.heading, 360); assert.equal(preferences.landing, "full-stop");
    assert.equal(preferences.flight, "return");
    if (airport.elevation < 6000) assert.equal(preferences.altitude, 7000);
    const approaches = exercise.radarEnvironment!.approaches;
    assert.equal(preferences.requestedApproach, (runwayEnds(airport).map(end => approaches.find(p => p.runway === end.id && p.type === "ils")).find(Boolean) ?? approaches[0]).id);
    const aircraft = createSpawnAircraft(exercise, randomUUID(), {...preferences, callsign: "Test 123", type: "A320", position: {x: 4, y: 9}});
    assert.deepEqual(aircraft.position, {x: 4, y: 9}); assert.equal(aircraft.heading, magneticToTrue(360, getAirport(exercise)));
    assert.equal(aircraft.radar?.flight, "return"); assert.equal(aircraft.radar?.expected, undefined);
    assert.equal(aircraft.radar?.cleared, undefined); assert.equal(aircraft.clearedToLand, false);
    const envelope = envelopeSchema.parse({id: randomUUID(), time: 0, action: {kind: "spawn", aircraft}});
    assert.equal(engine.applyEnvelope(exercise, envelope).error, undefined, `${airport.icao} ${mode}`);
  }
});

test("saved settings survive reopening, stay personal to the airport, and never reuse a position", t => {
  const values = storage(t), exercise = engineFor({trainingStation: "EGPH:approach"}).initialExercise();
  const saved = {...readSpawnPreferences("mentor", exercise), heading: 230, altitude: 9000, landing: "touch-and-go" as const, requestedApproach: "gps-24"};
  saveSpawnPreferences("mentor", exercise, {...saved, position: {x: 1, y: 2}, callsign: "Old"} as typeof saved);
  assert.deepEqual(readSpawnPreferences("mentor", exercise), saved);
  assert.equal(readSpawnPreferences("another-mentor", exercise).landing, "full-stop");
  assert.equal(readSpawnPreferences("mentor", engineFor({airport: "EGLL", trainingStation: "EGLL:approach"}).initialExercise()).heading, 360);
  assert.ok(![...values.values()][0].includes("position")); assert.ok(![...values.values()][0].includes("callsign"));
  const aircraft = createSpawnAircraft(exercise, randomUUID(), {...readSpawnPreferences("mentor", exercise), callsign: "New", type: "A320", position: {x: 8, y: 9}});
  assert.deepEqual(aircraft.position, {x: 8, y: 9}); assert.equal(aircraft.altitude, 9000);
});

test("changed approach availability falls back to an available approach without losing other preferences", t => {
  storage(t);
  const exercise = engineFor({trainingStation: "EGPH:approach"}).initialExercise();
  saveSpawnPreferences("mentor", exercise, {...readSpawnPreferences("mentor", exercise), requestedApproach: "gps-24", landing: "touch-and-go"});
  exercise.radarEnvironment!.approaches = exercise.radarEnvironment!.approaches.filter(p => p.id === "ils-06");
  assert.equal(readSpawnPreferences("mentor", exercise).requestedApproach, "ils-06");
  assert.equal(readSpawnPreferences("mentor", exercise).landing, "touch-and-go");
  exercise.radarEnvironment!.approaches = [];
  assert.equal(readSpawnPreferences("mentor", exercise).flight, "departure");
  assert.equal(readSpawnPreferences("mentor", exercise).requestedApproach, undefined);
});

test("corrupt or inaccessible storage leaves spawning usable with defaults", t => {
  const values = storage(t), exercise = engineFor({trainingStation: "EGPH:approach"}).initialExercise();
  const defaults = readSpawnPreferences("mentor", exercise);
  saveSpawnPreferences("mentor", exercise, defaults);
  const key = [...values.keys()][0];
  for (const invalid of ["{", "null", JSON.stringify({...defaults, heading: -1}), JSON.stringify({...defaults, landing: "invalid"})]) {
    values.set(key, invalid); assert.deepEqual(readSpawnPreferences("mentor", exercise), defaults);
  }
  Object.defineProperty(window, "localStorage", {get() {throw new Error("Storage blocked");}});
  assert.deepEqual(readSpawnPreferences("mentor", exercise), defaults);
  assert.doesNotThrow(() => saveSpawnPreferences("mentor", exercise, defaults));
});
