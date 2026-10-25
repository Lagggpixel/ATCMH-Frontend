import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {egllRushScenario} from "./egll-rush-scenario";
import {getAirport} from "./airports";
import {engineFor} from "./engine";
import {addLocalScenarioAircraft} from "./local-aircraft";
import {MAX_AIRCRAFT} from "./model";
import {exerciseSchema, motionSchema} from "./protocol";
import {advanceScenario} from "./scenario-engine";
import {createScenarioExercise, scenarioRuntimeSchema, scenarioSchema, standPlacement} from "./scenarios";

test("EGLL overload has exactly 20 departures in 20 minutes and 40 arrivals in 25 minutes", () => {
  const definition = egllRushScenario();
  assert.equal(definition.trainingStation, "EGLL:local");
  assert.equal(definition.aircraft.length, 60);
  assert.equal(new Set(definition.aircraft.map(a => a.seed.callsign.match(/\d+/)![0])).size, 60);
  const times = (prefix: string) => definition.events.filter(e => e.id.startsWith(prefix)).map(e => e.trigger.type === "time" ? e.trigger.at : NaN);
  assert.deepEqual(times("departure-"), Array.from({length: 20}, (_, i) => (i + 1) * 60));
  assert.deepEqual(times("arrival-"), Array.from({length: 40}, (_, i) => (i + 1) * 37.5));
  assert.ok(definition.aircraft.every(a => !a.initial && !a.seed.clearedToLand && !a.seed.clearedForOption));
  assert.ok(definition.events.every(e => e.actions.every(a => ["spawn", "request", "note"].includes(a.type))));
});

test("EGLL uses distinct mapped departure stands and 27L runway-relative arrival geometry", () => {
  const definition = egllRushScenario(), airport = getAirport(definition), engine = engineFor(definition), geometry = engine.runwayGeometry("27L");
  const ground = definition.aircraft.filter(a => a.key.startsWith("departure-"));
  assert.equal(new Set(ground.map(a => a.gateId)).size, 20);
  for (const a of ground) {
    assert.deepEqual(a.seed.position, standPlacement(a.gateId!, false, airport)!.position);
    assert.equal(a.seed.runway, "27R"); assert.equal(a.seed.mode, "parked"); assert.equal(a.seed.frequency, "ground");
    assert.equal(a.seed.altitude, airport.elevation); assert.equal(a.seed.speed, 0); assert.deepEqual(a.seed.taxiPath, []);
  }
  for (const a of definition.aircraft.filter(a => a.key.startsWith("arrival-"))) {
    assert.ok(Math.abs(engine.distance(a.seed.position, geometry.threshold) - 10) < 1e-8);
    assert.equal(a.seed.runway, "27L"); assert.equal(a.seed.leg, "final"); assert.equal(a.seed.frequency, "tower");
    assert.equal(a.seed.landing, "full-stop"); assert.equal(a.seed.radar, undefined); assert.equal(a.seed.speedMode, "auto");
    assert.ok(Math.abs(a.seed.altitude - airport.elevation - 3184) < 2);
  }
});

for (const automatic of [true, false]) test(`all 60 aircraft spawn and call exactly once, including past the former limit (Automatic ${automatic})`, () => {
  const definition = egllRushScenario();
  let {exercise, runtime} = createScenarioExercise(definition, randomUUID(), randomUUID());
  exercise.autoReadback = automatic;
  assert.equal(exercise.aircraft.length, 0);
  const paused = advanceScenario(exercise, runtime, 5, 0);
  assert.equal(paused.exercise.elapsed, 0);
  assert.ok(Object.values(runtime.events).every(e => e.status === "scheduled"));
  exercise.running = true;
  // Exercise every authored simulation-clock boundary with real event actions.
  // Aircraft movement is tested separately; holding position isolates feed integrity.
  for (const at of [...new Set(definition.events.map(e => e.trigger.type === "time" ? e.trigger.at : 0))]) {
    exercise.elapsed = at - .001;
    exercise = advanceScenario(exercise, runtime, 0, at * 1000).exercise;
    const before = exercise.aircraft.length;
    exercise.elapsed = at;
    exercise = advanceScenario(exercise, runtime, 0, at * 1000).exercise;
    const due = definition.events.filter(e => e.trigger.type === "time" && e.trigger.at === at && e.actions.some(a => a.type === "spawn")).length;
    assert.equal(exercise.aircraft.length - before, due);
    exerciseSchema.parse(exercise);
    motionSchema.parse(exercise);
    // Full snapshot recovery retains the remaining schedule and reservations.
    exercise = exerciseSchema.parse(JSON.parse(JSON.stringify(exercise)));
    runtime = scenarioRuntimeSchema.parse(JSON.parse(JSON.stringify(runtime)));
  }
  assert.equal(exercise.aircraft.length, 60);
  assert.equal(exercise.messages.filter(m => m.request?.id === "inbound-land").length, 40);
  assert.equal(exercise.messages.filter(m => m.request?.id === "pushback").length, 20);
  assert.ok(Object.values(runtime.events).every(e => e.status === "completed"));
  const count = exercise.messages.length;
  exercise = advanceScenario(exercise, runtime, 0, 1500001).exercise;
  assert.equal(exercise.messages.length, count);
});

test("scenario, live spawns and snapshot limits agree at 100 and reject the 101st aircraft", () => {
  const definition = egllRushScenario(), source = definition.aircraft[0];
  definition.aircraft = definition.aircraft.map(a => ({...a, initial: true})); definition.events = [];
  while (definition.aircraft.length < MAX_AIRCRAFT) {
    const n = definition.aircraft.length;
    definition.aircraft.push({...structuredClone(source), key: `extra-${n}`, initial: true, seed: {...structuredClone(source.seed), callsign: `Test ${1000 + n}`}});
  }
  scenarioSchema.parse(definition);
  const {exercise} = createScenarioExercise(definition, randomUUID(), randomUUID());
  exerciseSchema.parse(exercise); motionSchema.parse(exercise);
  const engine = engineFor(exercise), extra = {...engine.newAircraft("overflow", true), callsign: "Test 9999"};
  assert.match(engine.applyEnvelope(exercise, {id: randomUUID(), time: 0, action: {kind: "spawn", aircraft: extra}}).error!, /100 aircraft/);
  assert.throws(() => addLocalScenarioAircraft(definition, extra, undefined, 0), /100 aircraft/);
  assert.equal(scenarioSchema.safeParse({...definition, aircraft: [...definition.aircraft, {...source, key: "overflow", initial: true}]}).success, false);
  assert.equal(exerciseSchema.safeParse({...exercise, aircraft: [...exercise.aircraft, extra]}).success, false);
  const under = {...exercise, aircraft: exercise.aircraft.slice(0, 99)};
  const result = engine.applyEnvelope(under, {id: randomUUID(), time: 0, action: {kind: "spawn", aircraft: extra}});
  assert.equal(result.error, undefined); assert.equal(result.state.aircraft.length, 100);
});
