import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {airportCallsign, defaultRunway, getAirport, runwayEnds} from "./airports";
import {highTerrainScenario, HIGH_TERRAIN_AIRPORTS} from "./high-terrain-scenarios";
import {createScenarioExercise, materializeAircraft, scenarioSchema} from "./scenarios";
import {advanceScenario} from "./scenario-engine";
import {engineFor, restoreExercise} from "./engine";
import {exerciseSchema} from "./protocol";
import {approachGeometry, assignRadar} from "./radar";
import {catalogFor} from "./catalog";

for (const code of HIGH_TERRAIN_AIRPORTS) {
  test(`${code}: source airports and GA assignments are usable without initial clearances`, () => {
    const definition = highTerrainScenario(code), airport = getAirport(definition);
    assert.ok(scenarioSchema.safeParse(definition).success);
    assert.equal(definition.aircraft.length, code === "KASE" ? 8 : 6);
    assert.equal(airportCallsign(airport), code === "KASE" ? "Aspen" : "Lukla");
    assert.equal(defaultRunway(airport), code === "KASE" ? "15" : "06");
    assert.deepEqual(runwayEnds(airport).map(e => e.id), code === "KASE" ? ["15", "33"] : ["06", "24"]);
    assert.deepEqual(definition.radarEnvironment!.approaches.map(a => a.id), code === "KASE" ? ["ils-15","gps-15", "visual-15","gps-33","visual-33"] : ["gps-06","visual-06","gps-24","visual-24"]);
    const {runtime} = createScenarioExercise(definition, "radio", randomUUID()), a = materializeAircraft(runtime, "ga-1");
    const catalog = catalogFor(airport), request = catalog.pilotRequests(a).find(r => r.id === "request-approach")!;
    const text = catalog.pilotRequestText(a, request, null);
    assert.ok(text.includes(code));
    assert.match(text, code === "KASE" ? /ILS/ : /GPS/);
    for (const {seed} of definition.aircraft) {
      assert.ok(["C208", "TBM9"].includes(seed.type));
      assert.equal(seed.speedMode, "manual"); assert.ok(seed.speed <= 140);
      assert.equal(seed.runway, null); assert.equal(seed.landing, "full-stop");
      assert.equal(seed.clearedToLand, false); assert.equal(seed.radar!.expected, undefined);
      assert.equal(seed.radar!.cleared, undefined); assert.equal(seed.radar!.requestedApproach, undefined);
      assert.equal(seed.radar!.targetAltitude, undefined, "no unchecked automatic descent");
      assert.ok(seed.altitude >= airport.elevation + 2000);
    }
  });
  test(`${code}: all check-ins spawn once, pause freezes releases and restored state continues`, () => {
    const definition = highTerrainScenario(code);
    const {runtime, exercise: initial} = createScenarioExercise(definition, "terrain", randomUUID());
    let exercise = {...initial, running: true};
    exercise = advanceScenario(exercise, runtime, 0, 0).exercise;
    const before = structuredClone(runtime.events);
    assert.equal(advanceScenario({...exercise, running: false}, runtime, 5, 1000).changed, false);
    assert.deepEqual(runtime.events, before);
    for (let t = 0; t < 1085; t += 5) exercise = advanceScenario(exercise, runtime, 5, t * 1000).exercise;
    assert.equal(exercise.aircraft.length, definition.aircraft.length);
    for (const event of definition.events.filter(e => e.id.startsWith("check-in"))) assert.equal(runtime.events[event.id].status, "completed");
    assert.equal(exercise.messages.filter(m => m.sender === "pilot" && /from .*feet, inbound/.test(m.text)).length, definition.aircraft.length);
    assert.ok(exerciseSchema.safeParse(exercise).success);
    const restored = restoreExercise(exerciseSchema.parse(JSON.parse(JSON.stringify(exercise))));
    assert.equal(engineFor(definition).advance(restored, 1).aircraft.length, definition.aircraft.length);
  });
  test(`${code}: a managed 100 kt visual final touches down, stops and vacates without a go-around`, () => {
    const definition = highTerrainScenario(code), airport = getAirport(definition), engine = engineFor(definition);
    const {runtime, exercise} = createScenarioExercise(definition, "landing", randomUUID());
    const a = materializeAircraft(runtime, "ga-1"), runway = defaultRunway(airport), g = approachGeometry(airport, runway);
    a.position = {x: g.threshold.x - g.vector.x * 6, y: g.threshold.y - g.vector.y * 6};
    a.heading = a.targetHeading = g.heading; a.speed = a.targetSpeed = 100; a.altitude = airport.elevation + 1800;
    a.flightPlan = []; a.radar!.navigation = "heading";
    assignRadar(a, {type: "expect-approach", approachId: `visual-${runway}`}, airport, definition.radarEnvironment!);
    assignRadar(a, {type: "vector", approachId: `visual-${runway}`}, airport, definition.radarEnvironment!);
    a.frequency = "tower"; a.radar!.transferred = true;
    let state = {...exercise, running: true, aircraft: [a]}, landed = false;
    for (let t = 0; t < 900 && state.aircraft.length; t += .5) {
      state = engine.advance(state, .5);
      const current = state.aircraft[0];
      if (current?.radar?.arrival) landed = true;
      assert.notEqual(current?.radar?.navigation, "missed");
    }
    assert.ok(landed, "must physically reach the runway");
    assert.equal(state.aircraft.length, 0, "must vacate through mapped geometry");
  });
}

test("Aspen preserves the filed route and first approach types with full stops and no planned repeats", () => {
  const definition = highTerrainScenario("KASE");
  assert.deepEqual(definition.aircraft[0].seed.flightPlan.map(p => p.name), ["KEGE", "DBL", "HEPEB", "ALLIX", "MAFMU"]);
  assert.equal(definition.aircraft[0].seed.radar!.navigation, "route");
  assert.ok(definition.aircraft.slice(1).every(a => a.seed.flightPlan.length === 0 && a.seed.radar!.navigation === "heading"));
  assert.deepEqual(definition.aircraft.filter(a => a.seed.type === "TBM9").map(a => a.key), ["ga-2", "ga-5", "ga-8"]);
  const checkIns = definition.events.filter(e => e.id.startsWith("check-in"));
  const intentions = checkIns.flatMap(e => e.actions.filter(a => a.type === "transmission").map(a => a.text));
  assert.equal(intentions.length, 8);
  assert.deepEqual(intentions.map(text => text.split("request ")[1]), [
    "GPS (RNV-F, DBL transition), full stop.", "Visual, full stop.", "RV, full stop.", "Visual, full stop.",
    "RV, full stop.", "RV, full stop.", "Visual, full stop.", "Visual, full stop.",
  ]);
  assert.equal(definition.events.filter(e => /early-missed|second-approach/.test(e.id)).length, 0);
  assert.match(definition.instructorNotes, /Full stop on the FIRST approach for all eight/);
  assert.doesNotMatch(definition.instructorNotes, /→ missed|Next approach:|second approach full stop/);
});

test("Lukla retains southbound starts and the Khotang identity, with no invented filed routes", () => {
  const definition = highTerrainScenario("VNLK");
  assert.equal(definition.aircraft[0].seed.heading, 180); assert.equal(definition.aircraft[4].seed.heading, 180);
  assert.ok(definition.aircraft.every(a => a.seed.flightPlan.length === 0));
  const khotang = definition.radarEnvironment!.fixes.find(f => f.id === "VNKG")!;
  assert.ok(khotang.point.y < -25 && khotang.point.x > 0);
  assert.equal(definition.events.filter(e => e.id.startsWith("second-approach")).length, 0);
  definition.aircraft[0].seed.position.x = 999;
  assert.notEqual(highTerrainScenario("VNLK").aircraft[0].seed.position.x, 999);
});
