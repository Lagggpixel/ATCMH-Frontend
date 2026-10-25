import assert from "node:assert/strict";
import test from "node:test";
import {engineFor} from "./engine";
import {getAirport, airportList, airportRunways} from "./airports";
import {advancePerformance, trueAirspeed} from "./aircraft-performance";
import {aircraftMessageHeading} from "./aircraft-message-heading";
import {aircraftAppearance} from "./aircraft-flashing";
import {assignRadarSpeed} from "./radar-speed";
import {AIRCRAFT_CATALOG} from "./aircraft-catalog";
import {aircraftSymbol} from "./aircraft-symbol";
import {aviationSpeech} from "./radio-speech";
import {catalogFor} from "./catalog";
import {browserRecordingPlayback} from "./recorded-output";
import {weatherCategory} from "./airport-display";
import {insideAirspace} from "./aviation";
import {EXERCISE_WEATHER, patternLegLabel} from "./model";

test("all fleet identifiers, full names and aliases select the IF icon category", () => {
  assert.ok(AIRCRAFT_CATALOG.length >= 40);
  assert.equal(new Set(AIRCRAFT_CATALOG.map(a => a.id)).size, AIRCRAFT_CATALOG.length);
  for (const entry of AIRCRAFT_CATALOG) for (const name of [entry.id, entry.name, ...(entry.aliases ?? [])]) assert.equal(aircraftSymbol(name), entry.symbol, name);
  assert.equal(aircraftSymbol("BCS3"), "jet"); assert.equal(aircraftSymbol("C30J"), "military"); assert.equal(aircraftSymbol("CL35"), "regional");
});

test("aircraft without a performance profile separate IAS, TAS, ground speed and track", () => {
  const e = engineFor({airport: "KDAL"}), a = {...e.newAircraft("legacy", true), mode: "heading" as const, altitude: 30000, heading: 90, speed: 250};
  delete a.performanceProfile;
  const weather = {...EXERCISE_WEATHER, windDirection: 0, windSpeed: 30};
  const before = {...a.position, altitude: a.altitude};
  a.position = {x: a.position.x + a.speed / 3600, y: a.position.y};
  advancePerformance(a, before, 1, weather);
  const tas = trueAirspeed(a.speed, a.altitude, weather);
  assert.ok(Math.abs(a.groundSpeed! - Math.hypot(tas, 30)) < 1e-8);
  assert.ok(Math.abs(Math.hypot(a.position.x - before.x, a.position.y - before.y) * 3600 - a.groundSpeed!) < 1e-7);
  assert.notEqual(Math.round(a.groundSpeed!), a.speed); assert.notEqual(a.track, a.heading);
});

test("Mach instructions and the displayed Mach share altitude, temperature and pressure", () => {
  const e = engineFor({airport: "KDAL"});
  for (const profile of [undefined, "A320"] as const) for (const temperature of [-10, 15, 35]) for (const altitude of [18000, 30000, 39000]) {
    const a = {...e.newAircraft("mach", true), mode: "heading" as const, performanceProfile: profile, altitude};
    const weather = {...EXERCISE_WEATHER, temperature, qnh: 995};
    assignRadarSpeed(a, {type: "radar-speed", mode: "maintain", relation: "exact", unit: "mach", value: .78}, weather);
    a.speed = a.targetSpeed;
    assert.match(aircraftMessageHeading(a, getAirport({airport: "KDAL"}), weather).speed, /M0\.78 /);
  }
});

test("a touch-and-go retires the controller's green landing indication", () => {
  const e = engineFor({airport: "KDAL"}), ap = getAirport({airport: "KDAL"}), g = e.runwayGeometry("31R");
  const s = e.initialExercise(); s.running = true;
  s.aircraft = [{...e.newAircraft("tng", true), runway: "31R", mode: "pattern", leg: "final", position: {...g.threshold}, heading: g.heading, targetHeading: g.heading, altitude: ap.elevation, speed: 135, targetSpeed: 135, clearedToLand: true, clearedForOption: true, landing: "touch-and-go", assigned: {landing: true}}];
  const a = e.advance(s, .1).aircraft[0];
  assert.equal(a.clearedToLand, false); assert.equal(a.assigned?.landing, false); assert.notEqual(aircraftAppearance(a, "tower").textColor, "#90ee90");
});

test("sequencing survives a stale spoken leg and rejects circular follow dependencies", () => {
  const e = engineFor({airport: "EGPH"}); let s = e.initialExercise();
  s.aircraft = ["a", "b"].map((id, i) => {const a = e.newAircraft(id, true); a.leg = "downwind"; a.position = {...e.patternTargets(a).crosswind, x: e.patternTargets(a).crosswind.x + i}; return a;});
  const first = e.applyEnvelope(s, {id: "follow-b", time: 1, action: {kind: "command", aircraftId: "a", frequency: "tower", command: {type: "sequence", number: 2, traffic: "Final"}, text: "number 2 traffic final"}});
  assert.equal(first.error, undefined); assert.equal(first.state.aircraft[0].sequence?.followingId, "b"); s = first.state;
  const second = e.applyEnvelope(s, {id: "follow-a", time: 2, action: {kind: "command", aircraftId: "b", frequency: "tower", command: {type: "sequence", number: 2, traffic: patternLegLabel(s.aircraft[0])}, text: "number 2"}});
  assert.match(second.error!, /follow each other/); assert.equal(second.state, s);
});

test("GA can be scheduled on every supported runway, including KDAL 31R", () => {
  for (const airport of airportList) {
    const e = engineFor({airport: airport.icao});
    for (const pair of airportRunways(airport)) for (const end of pair.ends) {
      const g = e.runwayGeometry(end.id), s = e.initialExercise();
      s.aircraft = ["a", "b"].map((id, i) => ({...e.newAircraft(id, true), runway: end.id, leg: "final", mode: "pattern", frequency: "tower", landing: "full-stop", speed: 135, targetSpeed: 135, altitude: airport.elevation + (i ? 5.5 : 2) * 318, heading: g.heading, position: {x: g.threshold.x - g.vector.x * (i ? 5.5 : 2), y: g.threshold.y - g.vector.y * (i ? 5.5 : 2)}}));
      const result = e.applyEnvelope(s, {id: "ga", time: 1, action: {kind: "conflict", conflict: "ga", aircraftId: "a", otherId: "b"}});
      assert.equal(result.error, undefined, `${airport.icao} ${end.id}`);
    }
  }
});

test("KDAL GA exercises keep the leader moving and finish when it clears or the follower goes around", () => {
  const airport = getAirport({airport: "KDAL"}), e = engineFor({airport: "KDAL"});
  for (const pair of airportRunways(airport)) for (const end of pair.ends) {
    const g = e.runwayGeometry(end.id); let state = e.initialExercise(); state.running = true;
    state.aircraft = ["a", "b"].map((id, i) => ({...e.newAircraft(id, true), runway: end.id, mode: "pattern", leg: "final", frequency: "tower", landing: "full-stop", clearedToLand: true, speed: 135, targetSpeed: 135, altitude: airport.elevation + (i ? 5.5 : 2) * 318, heading: g.heading, targetHeading: g.heading, position: {x: g.threshold.x - g.vector.x * (i ? 5.5 : 2), y: g.threshold.y - g.vector.y * (i ? 5.5 : 2)}}));
    state = e.applyEnvelope(state, {id: "ga", time: 1, action: {kind: "conflict", conflict: "ga", aircraftId: "a", otherId: "b"}}).state;
    for (let i = 0; i < 500 && state.conflicts![0].phase !== "complete"; i++) {
      state = e.advance(state, 1);
      const leader = state.aircraft[0];
      if (leader.mode === "rollout" && leader.runwayExit) assert.ok(leader.speed >= 5 - 1e-8, `${end.id}: GA must not stop the leader`);
    }
    assert.equal(state.conflicts![0].phase, "complete", end.id);
    assert.ok(["Following aircraft went around", "Runway conflict ended"].includes(state.conflicts![0].outcome!), end.id); assert.equal(state.collisions?.length ?? 0, 0);
    assert.equal(state.aircraft[0].conflictMotion, undefined, "the leader is released after the exercise");
  }
});

test("Pacific airspaces do not incorrectly label airports across the antimeridian", () => {
  const boundary = [[170, -20], [-170, -20], [-170, 20], [170, 20]];
  assert.equal(insideAirspace(boundary, 0, 179), true); assert.equal(insideAirspace(boundary, 0, -179), true);
  assert.equal(insideAirspace(boundary, 0, -96), false);
});

test("UWC tolerates different legs and altitudes and survives the natural base turn", () => {
  const e = engineFor({airport: "KJFK"}), s = e.initialExercise(); s.running = true;
  s.aircraft = ["a", "b"].map((id, i) => {const a = e.newAircraft(id, true); a.runway = i ? "22R" : "22L"; a.mode = "pattern"; a.leg = "downwind"; a.landing = "touch-and-go"; a.position = e.patternTargets(a).crosswind; a.altitude = 1513 + i * 1000; a.speed = a.targetSpeed = 180; return a;});
  s.aircraft[1].leg = "crosswind";
  const result = e.applyEnvelope(s, {id: "uwc", time: 1, action: {kind: "conflict", conflict: "uwc", aircraftId: "a", otherId: "b"}});
  assert.equal(result.error, undefined); let state = result.state;
  let base = false;
  for (let i = 0; i < 600; i++) {state = e.advance(state, 1); base ||= state.aircraft.some(a => a.leg === "base"); assert.notEqual(state.conflicts![0].outcome, "Aircraft are no longer naturally aligned");}
  assert.ok(base);
});

test("calm clearances and routed taxiway speech use the correct words", () => {
  const e = engineFor({airport: "KDAL"}), a = e.newAircraft("words", true), ap = getAirport({airport: "KDAL"});
  const catalog = catalogFor(ap, undefined, {...EXERCISE_WEATHER, windDirection: 0, windSpeed: 0, windGust: 0});
  for (const command of [{type: "land"}, {type: "takeoff"}] as const) assert.match(catalog.instructionText(a, command), /wind calm/);
  assert.match(aviationSpeech("Taxi to runway 31R via C, C1, A, hold short of runway 13L"), /via Charlie, Charlie one, Alpha, hold short/);
  assert.match(aviationSpeech("Turn left next taxiway B2"), /taxiway Bravo two/);
  assert.equal(weatherCategory({...EXERCISE_WEATHER, visibilityKm: 16, rawMetar: "KDAL 241200Z 00000KT 10SM FEW020 SCT080"}), "VFR");
});

test("a rejected audio primer can be retried on the next touch activation", async () => {
  const previous = globalThis.Audio; let attempts = 0;
  globalThis.Audio = class {preload = ""; src = ""; onended: (() => void) | null = null; onerror: (() => void) | null = null; play() {attempts++; return Promise.reject(new Error("NotAllowedError"));} pause() {} load() {} removeAttribute() {this.src = "";}} as unknown as typeof Audio;
  const playback = browserRecordingPlayback();
  try {playback.activate(); await new Promise(resolve => setImmediate(resolve)); playback.activate(); await new Promise(resolve => setImmediate(resolve)); assert.equal(attempts, 2);}
  finally {playback.dispose(); globalThis.Audio = previous;}
});
